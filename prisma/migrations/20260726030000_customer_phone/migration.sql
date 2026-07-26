-- AlterTable
ALTER TABLE "TelegramCustomer" ADD COLUMN "phone" TEXT;
ALTER TABLE "TelegramCustomer" ADD COLUMN "phoneNormalized" TEXT;

-- CreateIndex
CREATE INDEX "TelegramCustomer_phoneNormalized_idx" ON "TelegramCustomer"("phoneNormalized");

-- CreateIndex
CREATE INDEX "TelegramCustomer_lastObservedAt_idx" ON "TelegramCustomer"("lastObservedAt");
