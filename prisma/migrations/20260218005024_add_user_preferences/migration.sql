-- AlterTable
ALTER TABLE "User" ADD COLUMN "metodoPagamentoPadrao" TEXT DEFAULT 'cartao',
ADD COLUMN "notificacoesAtivas" BOOLEAN NOT NULL DEFAULT true;