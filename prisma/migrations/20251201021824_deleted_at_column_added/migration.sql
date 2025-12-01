-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Event_deleted_at_idx" ON "Event"("deleted_at");
