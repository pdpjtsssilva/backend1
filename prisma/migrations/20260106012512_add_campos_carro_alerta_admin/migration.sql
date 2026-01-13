-- AlterTable
ALTER TABLE "Carro" ADD COLUMN "inspecao" TEXT;
ALTER TABLE "Carro" ADD COLUMN "licenciamento" TEXT;
ALTER TABLE "Carro" ADD COLUMN "seguro" TEXT;

-- CreateTable
CREATE TABLE "AlertaAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "motoristaId" TEXT NOT NULL,
    "carroId" TEXT,
    "dados" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
