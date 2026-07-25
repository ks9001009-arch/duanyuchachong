-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "AdminUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLoginLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "username" TEXT,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AdminLoginLog_adminUserId_createdAt_idx" ON "AdminLoginLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminLoginLog_success_createdAt_idx" ON "AdminLoginLog"("success", "createdAt");

-- CreateIndex
CREATE INDEX "AdminLoginLog_createdAt_idx" ON "AdminLoginLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminLoginLog" ADD CONSTRAINT "AdminLoginLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
