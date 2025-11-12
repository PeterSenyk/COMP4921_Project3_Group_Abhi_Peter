-- AlterTable: Add profile_image_url to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profile_image_url" TEXT;

-- AlterTable: Add views to Post table
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Remove dislikes column from Thread (if it exists) and ensure we have likes
-- Note: We're keeping likes column which should already exist
-- If dislikes exists and we want to remove it, uncomment the following:
-- ALTER TABLE "Thread" DROP COLUMN IF EXISTS "dislikes";

-- CreateTable: ThreadLike to track user likes
CREATE TABLE IF NOT EXISTS "ThreadLike" (
    "thread_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "ThreadLike_pkey" PRIMARY KEY ("thread_id","user_id")
);

-- AddForeignKey
ALTER TABLE "ThreadLike" ADD CONSTRAINT "ThreadLike_thread_id_fkey" 
    FOREIGN KEY ("thread_id") REFERENCES "Thread"("thread_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadLike" ADD CONSTRAINT "ThreadLike_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

