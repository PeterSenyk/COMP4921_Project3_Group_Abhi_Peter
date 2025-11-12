/*
  Warnings:

  - You are about to drop the column `parent_comment_id` on the `Thread` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Thread" DROP CONSTRAINT "Thread_parent_comment_id_fkey";

-- AlterTable
ALTER TABLE "Thread" DROP COLUMN "parent_comment_id",
ADD COLUMN     "parent_thread_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_parent_thread_id_fkey" FOREIGN KEY ("parent_thread_id") REFERENCES "Thread"("thread_id") ON DELETE SET NULL ON UPDATE CASCADE;
