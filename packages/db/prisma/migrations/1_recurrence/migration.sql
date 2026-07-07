-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "recurrenceInterval" TEXT,
ADD COLUMN     "recurrenceLastRun" TIMESTAMP(3),
ADD COLUMN     "recurringFromId" TEXT;

