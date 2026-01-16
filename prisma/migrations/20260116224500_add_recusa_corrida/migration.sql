-- AlterTable
ALTER TABLE "Corrida" ADD COLUMN     "recusaCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimaRecusaMotoristaId" TEXT,
ADD COLUMN     "ultimaRecusaEm" TIMESTAMP(3);
