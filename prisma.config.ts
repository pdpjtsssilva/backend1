// prisma.config.ts  → configuração usada a partir do Prisma 7
import { defineConfig } from '@prisma/cli'

export default defineConfig({
  // caminho para o schema
  schema: './prisma/schema.prisma',

  // configuração da fonte de dados
  datasources: {
    db: {
      // URL do banco de dados
      url: process.env.DATABASE_URL,
    },
  },
})