-- CreateTable
CREATE TABLE "BoundEntryChat" (
    "chatId" BIGINT NOT NULL,
    "title" TEXT,
    "boundByTelegramId" BIGINT NOT NULL,
    "boundByUsername" TEXT,
    "boundByDisplayName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unboundAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoundEntryChat_pkey" PRIMARY KEY ("chatId")
);

-- CreateIndex
CREATE INDEX "BoundEntryChat_active_idx" ON "BoundEntryChat"("active");
