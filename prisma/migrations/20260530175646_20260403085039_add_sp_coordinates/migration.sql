-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'TIMED_OUT';

-- AlterTable
ALTER TABLE "ServiceProviderProfile" ADD COLUMN     "dutyStatus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "amountPaid" DOUBLE PRECISION,
ADD COLUMN     "optedServices" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcmToken" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestRejection" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "spId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestRejection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimedOutRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'No professional accepted within 5 minutes',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimedOutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestRejection_requestId_spId_key" ON "ServiceRequestRejection"("requestId", "spId");

-- CreateIndex
CREATE UNIQUE INDEX "TimedOutRequest_requestId_key" ON "TimedOutRequest"("requestId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestRejection" ADD CONSTRAINT "ServiceRequestRejection_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestRejection" ADD CONSTRAINT "ServiceRequestRejection_spId_fkey" FOREIGN KEY ("spId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimedOutRequest" ADD CONSTRAINT "TimedOutRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
