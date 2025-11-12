/*
  Warnings:

  - Added the required column `option_name` to the `Option` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Option" ADD COLUMN     "option_name" TEXT NOT NULL;
