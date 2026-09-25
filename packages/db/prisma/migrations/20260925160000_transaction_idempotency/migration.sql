-- Idempotency key for offline expense entry (see assertGroupWrite-era offline work).
--
-- NULL for every existing row, and NULLs are exempt from a UNIQUE constraint in
-- PostgreSQL's default semantics, so this backfills nothing and cannot fail on
-- the production table. A plain non-null unique index would have.
--
-- Scoped to the group, not globally: the key is minted by a device, and two
-- devices must be able to produce the same value without coordinating.
ALTER TABLE "Transaction" ADD COLUMN "clientMutationId" TEXT;

CREATE UNIQUE INDEX "Transaction_clientMutationId_groupId_key"
  ON "Transaction"("clientMutationId", "groupId");
