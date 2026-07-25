-- CreateEnum
CREATE TYPE "TelegramCustomerStatus" AS ENUM ('IDENTIFIED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PendingCustomerStatus" AS ENUM ('PENDING_ID', 'RESOLVED', 'MERGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PendingFailureReason" AS ENUM ('HIDDEN_FORWARD_ORIGIN', 'ID_NOT_AVAILABLE', 'MANUAL_PENDING');

-- CreateEnum
CREATE TYPE "CustomerImportSource" AS ENUM ('USER_PICKER_SINGLE', 'USER_PICKER_BATCH', 'FORWARDED_MESSAGE', 'MANUAL_ID', 'PENDING_RESOLUTION');

-- CreateEnum
CREATE TYPE "CustomerImportResult" AS ENUM ('CREATED', 'DUPLICATE', 'PROFILE_UPDATED', 'PENDING_CREATED', 'PENDING_RESOLVED', 'PENDING_MERGED', 'HIDDEN_SENDER', 'INVALID', 'FAILED');

-- CreateTable
CREATE TABLE "SystemCounter" (
    "key" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TelegramCustomer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "usernameNormalized" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT,
    "status" "TelegramCustomerStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "firstImportedById" BIGINT NOT NULL,
    "firstImportedUsername" TEXT,
    "firstImportedName" TEXT,
    "firstImportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstImportSource" "CustomerImportSource" NOT NULL,
    "archiveChatId" BIGINT,
    "archiveMessageId" BIGINT,
    "archiveMessageLink" TEXT,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingTelegramCustomer" (
    "id" TEXT NOT NULL,
    "pendingCode" TEXT NOT NULL,
    "visibleName" TEXT,
    "visibleUsername" TEXT,
    "note" TEXT,
    "failureReason" "PendingFailureReason" NOT NULL,
    "status" "PendingCustomerStatus" NOT NULL DEFAULT 'PENDING_ID',
    "operatorTelegramId" BIGINT NOT NULL,
    "operatorUsername" TEXT,
    "operatorDisplayName" TEXT,
    "sourceChatId" BIGINT,
    "sourceMessageId" BIGINT,
    "archiveChatId" BIGINT,
    "archiveMessageId" BIGINT,
    "archiveMessageLink" TEXT,
    "resolvedCustomerId" TEXT,
    "resolvedByTelegramId" BIGINT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingTelegramCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramCustomerImportLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "targetTelegramId" BIGINT,
    "operatorTelegramId" BIGINT NOT NULL,
    "operatorUsername" TEXT,
    "operatorDisplayName" TEXT,
    "source" "CustomerImportSource" NOT NULL,
    "result" "CustomerImportResult" NOT NULL,
    "sourceChatId" BIGINT,
    "sourceMessageId" BIGINT,
    "archiveMessageLink" TEXT,
    "metadata" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramCustomerImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCustomer_customerCode_key" ON "TelegramCustomer"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCustomer_telegramId_key" ON "TelegramCustomer"("telegramId");

-- CreateIndex
CREATE INDEX "TelegramCustomer_usernameNormalized_idx" ON "TelegramCustomer"("usernameNormalized");

-- CreateIndex
CREATE INDEX "TelegramCustomer_displayName_idx" ON "TelegramCustomer"("displayName");

-- CreateIndex
CREATE INDEX "TelegramCustomer_firstImportedAt_idx" ON "TelegramCustomer"("firstImportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingTelegramCustomer_pendingCode_key" ON "PendingTelegramCustomer"("pendingCode");

-- CreateIndex
CREATE INDEX "PendingTelegramCustomer_status_createdAt_idx" ON "PendingTelegramCustomer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingTelegramCustomer_operatorTelegramId_createdAt_idx" ON "PendingTelegramCustomer"("operatorTelegramId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingTelegramCustomer_visibleName_idx" ON "PendingTelegramCustomer"("visibleName");

-- CreateIndex
CREATE INDEX "PendingTelegramCustomer_resolvedCustomerId_idx" ON "PendingTelegramCustomer"("resolvedCustomerId");

-- CreateIndex
CREATE INDEX "TelegramCustomerImportLog_customerId_createdAt_idx" ON "TelegramCustomerImportLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramCustomerImportLog_targetTelegramId_idx" ON "TelegramCustomerImportLog"("targetTelegramId");

-- CreateIndex
CREATE INDEX "TelegramCustomerImportLog_operatorTelegramId_createdAt_idx" ON "TelegramCustomerImportLog"("operatorTelegramId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramCustomerImportLog_source_result_idx" ON "TelegramCustomerImportLog"("source", "result");

-- AddForeignKey
ALTER TABLE "PendingTelegramCustomer" ADD CONSTRAINT "PendingTelegramCustomer_resolvedCustomerId_fkey" FOREIGN KEY ("resolvedCustomerId") REFERENCES "TelegramCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramCustomerImportLog" ADD CONSTRAINT "TelegramCustomerImportLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TelegramCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
