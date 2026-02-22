-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "senha" TEXT NOT NULL,
  "telefone" TEXT,
  "documento" TEXT,
  "tipo" TEXT NOT NULL DEFAULT 'passageiro',
  "cnhFrenteUri" TEXT,
  "cnhVersoUri" TEXT,
  "cnhStatus" TEXT DEFAULT 'pendente',
  "statusConta" TEXT NOT NULL DEFAULT 'ativo',
  "suspensoAte" TIMESTAMP(3),
  "metodoPagamentoPadrao" TEXT DEFAULT 'cartao',
  "notificacoesAtivas" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_documento_key" ON "User"("documento");