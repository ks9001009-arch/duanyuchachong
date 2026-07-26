-- DropIndex
DROP INDEX IF EXISTS "TelegramCustomer_lastObservedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "TelegramCustomer_phoneNormalized_idx";

-- AlterTable
ALTER TABLE "TelegramCustomer" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "TelegramCustomer" DROP COLUMN IF EXISTS "phoneNormalized";

-- DropTable
DROP TABLE IF EXISTS "BoundEntryChat";

-- DropTable
DROP TABLE IF EXISTS "GroupLead";

-- Optional counter cleanup (ignore if absent)
DELETE FROM "SystemCounter" WHERE "key" = 'LEAD_CODE';
