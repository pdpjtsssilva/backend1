-- AlterTable
ALTER TABLE "User" ADD COLUMN     "documento" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_documento_key" ON "User"("documento");

-- AlterTable
ALTER TABLE "Corrida" ADD COLUMN     "avaliacaoPassageiro" INTEGER,
ADD COLUMN     "comentarioPassageiro" TEXT;
