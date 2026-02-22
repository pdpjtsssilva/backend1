-- CreateTable User
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

-- CreateTable Corrida
CREATE TABLE IF NOT EXISTS "Corrida" (
  "id" TEXT NOT NULL,
  "passageiroId" TEXT NOT NULL,
  "motoristaId" TEXT,
  "origemLat" DOUBLE PRECISION NOT NULL,
  "origemLng" DOUBLE PRECISION NOT NULL,
  "origemEndereco" TEXT NOT NULL,
  "destinoLat" DOUBLE PRECISION NOT NULL,
  "destinoLng" DOUBLE PRECISION NOT NULL,
  "destinoEndereco" TEXT NOT NULL,
  "distancia" DOUBLE PRECISION NOT NULL,
  "preco" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'aguardando',
  "metodoPagamento" TEXT,
  "canceladoPor" TEXT,
  "recusaCount" INTEGER NOT NULL DEFAULT 0,
  "ultimaRecusaMotoristaId" TEXT,
  "ultimaRecusaEm" TIMESTAMP(3),
  "avaliacao" INTEGER,
  "comentarioAvaliacao" TEXT,
  "avaliacaoPassageiro" INTEGER,
  "comentarioPassageiro" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Corrida_pkey" PRIMARY KEY ("id")
);

-- CreateTable Favorito
CREATE TABLE IF NOT EXISTS "Favorito" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "endereco" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "icone" TEXT NOT NULL DEFAULT 'star',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorito_pkey" PRIMARY KEY ("id")
);

-- CreateTable Cartao
CREATE TABLE IF NOT EXISTS "Cartao" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "validade" TEXT NOT NULL,
  "bandeira" TEXT NOT NULL,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable Carteira
CREATE TABLE IF NOT EXISTS "Carteira" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable Transacao
CREATE TABLE IF NOT EXISTS "Transacao" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "valor" DOUBLE PRECISION NOT NULL,
  "descricao" TEXT NOT NULL,
  "categoria" TEXT,
  "metodoPagamento" TEXT,
  "status" TEXT NOT NULL DEFAULT 'aprovada',
  "referencia" TEXT,
  "gatewayId" TEXT,
  "saldoAnterior" DOUBLE PRECISION NOT NULL,
  "saldoNovo" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable Carro
CREATE TABLE IF NOT EXISTS "Carro" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "marca" TEXT NOT NULL,
  "modelo" TEXT NOT NULL,
  "placa" TEXT NOT NULL,
  "cor" TEXT,
  "ano" INTEGER,
  "seguro" TEXT,
  "inspecao" TEXT,
  "licenciamento" TEXT,
  "docSeguroUri" TEXT,
  "docInspecaoUri" TEXT,
  "docLicenciamentoUri" TEXT,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Carro_pkey" PRIMARY KEY ("id")
);

-- CreateTable AlertaAdmin
CREATE TABLE IF NOT EXISTS "AlertaAdmin" (
  "id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "motoristaId" TEXT NOT NULL,
  "carroId" TEXT,
  "dados" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlertaAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_documento_key" ON "User"("documento");
CREATE UNIQUE INDEX IF NOT EXISTS "Carteira_userId_key" ON "Carteira"("userId");

-- AddForeignKeys
ALTER TABLE "Corrida" DROP CONSTRAINT IF EXISTS "Corrida_passageiroId_fkey";
ALTER TABLE "Corrida" ADD CONSTRAINT "Corrida_passageiroId_fkey" FOREIGN KEY ("passageiroId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorito" DROP CONSTRAINT IF EXISTS "Favorito_userId_fkey";
ALTER TABLE "Favorito" ADD CONSTRAINT "Favorito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Cartao" DROP CONSTRAINT IF EXISTS "Cartao_userId_fkey";
ALTER TABLE "Cartao" ADD CONSTRAINT "Cartao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Carteira" DROP CONSTRAINT IF EXISTS "Carteira_userId_fkey";
ALTER TABLE "Carteira" ADD CONSTRAINT "Carteira_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transacao" DROP CONSTRAINT IF EXISTS "Transacao_userId_fkey";
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Carro" DROP CONSTRAINT IF EXISTS "Carro_userId_fkey";
ALTER TABLE "Carro" ADD CONSTRAINT "Carro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;