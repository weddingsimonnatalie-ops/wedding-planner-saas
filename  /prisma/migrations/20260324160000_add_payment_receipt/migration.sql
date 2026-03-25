-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "paymentId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_paymentId_idx" ON "Attachment"("paymentId");