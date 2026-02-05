-- AlterTable
ALTER TABLE "Transacao" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "metodoPagamento" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'aprovada',
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "gatewayId" TEXT;
