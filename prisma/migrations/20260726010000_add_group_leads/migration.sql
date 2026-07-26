-- CreateTable
CREATE TABLE "GroupLead" (
    "id" TEXT NOT NULL,
    "leadCode" TEXT NOT NULL,
    "username" TEXT,
    "usernameNormalized" TEXT,
    "nickname" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "requirement" TEXT,
    "operatorTelegramId" BIGINT NOT NULL,
    "operatorUsername" TEXT,
    "operatorDisplayName" TEXT,
    "sourceChatId" BIGINT,
    "sourceMessageId" BIGINT,
    "archiveChatId" BIGINT,
    "archiveMessageId" BIGINT,
    "archiveMessageLink" TEXT,
    "matchedCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupLead_leadCode_key" ON "GroupLead"("leadCode");

-- CreateIndex
CREATE INDEX "GroupLead_usernameNormalized_idx" ON "GroupLead"("usernameNormalized");

-- CreateIndex
CREATE INDEX "GroupLead_nickname_idx" ON "GroupLead"("nickname");

-- CreateIndex
CREATE INDEX "GroupLead_phoneNormalized_idx" ON "GroupLead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "GroupLead_createdAt_idx" ON "GroupLead"("createdAt");

-- CreateIndex
CREATE INDEX "GroupLead_matchedCustomerId_idx" ON "GroupLead"("matchedCustomerId");

-- AddForeignKey
ALTER TABLE "GroupLead" ADD CONSTRAINT "GroupLead_matchedCustomerId_fkey" FOREIGN KEY ("matchedCustomerId") REFERENCES "TelegramCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
