/*
  Warnings:

  - You are about to drop the column `parent_comment` on the `Thread` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Thread" DROP COLUMN "parent_comment",
ADD COLUMN     "parent_comment_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "Thread"("thread_id") ON DELETE SET NULL ON UPDATE CASCADE;
