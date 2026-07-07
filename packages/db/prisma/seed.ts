/**
 * Seed a demo group ("Tatry 2026") with virtual members and a few expenses,
 * computing all splits with @evenup/core so the seeded numbers are identical to
 * what the app would produce. Idempotent-ish: it wipes and reseeds.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { splitEqually, deriveInitials, colorForIndex } from '@evenup/core';
import { fromMinor } from '../src/money.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Clean slate (respecting FK order via cascading deletes on Group).
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const olivia = await prisma.user.create({
    data: { name: 'Olivia Nováková', email: 'olivia@example.com', locale: 'cs' },
  });

  const group = await prisma.group.create({
    data: {
      name: 'Tatry 2026',
      template: 'TRIP',
      baseCurrency: 'CZK',
      createdById: olivia.id,
    },
  });

  const names = ['Olivia Nováková', 'Petr Svoboda', 'Jana Dvořáková', 'Karel Černý'];
  const members = await Promise.all(
    names.map((displayName, i) =>
      prisma.member.create({
        data: {
          groupId: group.id,
          displayName,
          initials: deriveInitials(displayName),
          color: colorForIndex(i),
          role: i === 0 ? 'ADMIN' : 'MEMBER',
          userId: i === 0 ? olivia.id : null,
        },
      }),
    ),
  );
  const memberIds = members.map((m) => m.id);

  // Expense 1: Olivia paid 4 800 CZK for the cabin, split equally among all 4.
  await createEqualExpense(group.id, 'Chata', 480000, members[0]!.id, memberIds);
  // Expense 2: Petr paid 1 260 CZK for groceries, split equally among all 4.
  await createEqualExpense(group.id, 'Nákup jídla', 126000, members[1]!.id, memberIds);

  // eslint-disable-next-line no-console
  console.log(`Seeded group "${group.name}" with ${members.length} members and 2 expenses.`);
}

async function createEqualExpense(
  groupId: string,
  title: string,
  totalMinor: number,
  payerId: string,
  beneficiaryIds: string[],
): Promise<void> {
  const shares = splitEqually(
    totalMinor,
    beneficiaryIds.map((memberId) => ({ memberId })),
  );
  const total = fromMinor(totalMinor);
  const payers: Prisma.TransactionPayerCreateWithoutTransactionInput[] = [
    { member: { connect: { id: payerId } }, amountMinorUnits: total },
  ];
  const splits: Prisma.TransactionSplitCreateWithoutTransactionInput[] = shares.map((s) => ({
    member: { connect: { id: s.memberId } },
    computedMinorUnits: fromMinor(s.computedMinorUnits),
  }));

  await prisma.transaction.create({
    data: {
      groupId,
      type: 'EXPENSE',
      title,
      currency: 'CZK',
      totalMinorUnits: total,
      baseMinorUnits: total,
      date: new Date(),
      splitType: 'EQUAL',
      payers: { create: payers },
      splits: { create: splits },
    },
  });
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
