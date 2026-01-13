/*
  Warnings:

  - You are about to drop the `Veiculo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `avaliacao` on the `Corrida` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Veiculo_motoristaId_key";

-- DropIndex
DROP INDEX "Veiculo_placa_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Veiculo";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Cartao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "bandeira" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cartao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Carteira" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "saldo" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Carteira_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "saldoAnterior" REAL NOT NULL,
    "saldoNovo" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Corrida" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageiroId" TEXT NOT NULL,
    "motoristaId" TEXT,
    "origemLat" REAL NOT NULL,
    "origemLng" REAL NOT NULL,
    "origemEndereco" TEXT NOT NULL,
    "destinoLat" REAL NOT NULL,
    "destinoLng" REAL NOT NULL,
    "destinoEndereco" TEXT NOT NULL,
    "distancia" REAL NOT NULL,
    "preco" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "metodoPagamento" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Corrida_passageiroId_fkey" FOREIGN KEY ("passageiroId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Corrida" ("createdAt", "destinoEndereco", "destinoLat", "destinoLng", "distancia", "id", "motoristaId", "origemEndereco", "origemLat", "origemLng", "passageiroId", "preco", "status", "updatedAt") SELECT "createdAt", "destinoEndereco", "destinoLat", "destinoLng", "distancia", "id", "motoristaId", "origemEndereco", "origemLat", "origemLng", "passageiroId", "preco", "status", "updatedAt" FROM "Corrida";
DROP TABLE "Corrida";
ALTER TABLE "new_Corrida" RENAME TO "Corrida";
CREATE TABLE "new_Favorito" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "icone" TEXT NOT NULL DEFAULT 'star',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Favorito" ("createdAt", "endereco", "icone", "id", "latitude", "longitude", "nome", "userId") SELECT "createdAt", "endereco", "icone", "id", "latitude", "longitude", "nome", "userId" FROM "Favorito";
DROP TABLE "Favorito";
ALTER TABLE "new_Favorito" RENAME TO "Favorito";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "telefone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "nome", "senha", "telefone") SELECT "createdAt", "email", "id", "nome", "senha", "telefone" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Carteira_userId_key" ON "Carteira"("userId");
