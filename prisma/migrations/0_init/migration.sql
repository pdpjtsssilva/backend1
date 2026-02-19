-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('PASSAGEIRO', 'MOTORISTA');

-- CreateEnum
CREATE TYPE "StatusCorrida" AS ENUM ('PENDENTE', 'ACEITA', 'EM_ANDAMENTO', 'CHEGOU', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "telefone" TEXT,
    "avatar_url" TEXT,
    "tipo" "TipoUsuario" NOT NULL DEFAULT 'PASSAGEIRO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corrida" (
    "id" TEXT NOT NULL,
    "status" "StatusCorrida" NOT NULL DEFAULT 'PENDENTE',
    "latitude_origem" DOUBLE PRECISION NOT NULL,
    "longitude_origem" DOUBLE PRECISION NOT NULL,
    "endereco_origem" TEXT NOT NULL,
    "latitude_destino" DOUBLE PRECISION NOT NULL,
    "longitude_destino" DOUBLE PRECISION NOT NULL,
    "endereco_destino" TEXT NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "distancia" DOUBLE PRECISION,
    "duracao" INTEGER,
    "id_passageiro" TEXT NOT NULL,
    "id_motorista" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Corrida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalSalvo" (
    "id" TEXT NOT NULL,
    "nome_local" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "id_usuario" TEXT NOT NULL,

    CONSTRAINT "LocalSalvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "id_corrida" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_email_idx" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Corrida_status_idx" ON "Corrida"("status");

-- CreateIndex
CREATE INDEX "Corrida_id_motorista_idx" ON "Corrida"("id_motorista");

-- CreateIndex
CREATE INDEX "Corrida_id_passageiro_idx" ON "Corrida"("id_passageiro");

-- CreateIndex
CREATE INDEX "LocalSalvo_id_usuario_idx" ON "LocalSalvo"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Avaliacao_id_corrida_key" ON "Avaliacao"("id_corrida");

-- AddForeignKey
ALTER TABLE "Corrida" ADD CONSTRAINT "Corrida_id_passageiro_fkey" FOREIGN KEY ("id_passageiro") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Corrida" ADD CONSTRAINT "Corrida_id_motorista_fkey" FOREIGN KEY ("id_motorista") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalSalvo" ADD CONSTRAINT "LocalSalvo_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_id_corrida_fkey" FOREIGN KEY ("id_corrida") REFERENCES "Corrida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

