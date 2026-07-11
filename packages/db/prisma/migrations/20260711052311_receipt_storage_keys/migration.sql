-- Widen single receipt image key to an array, preserving existing keys.
ALTER TABLE "Receipt" ADD COLUMN "storageKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Receipt" SET "storageKeys" = ARRAY["storageKey"] WHERE "storageKey" <> '';
ALTER TABLE "Receipt" DROP COLUMN "storageKey";
