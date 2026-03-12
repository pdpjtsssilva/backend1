# Backend - Uber Clone

## Requisitos
- Node.js 18+
- PostgreSQL

## Variaveis de ambiente
Crie `.env` com:

```
PORT=10000
JWT_SECRET=defina_um_segredo_forte_aqui
GOOGLE_MAPS_KEY=sua_google_maps_api_key
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
STRIPE_SECRET_KEY=sk_test_sua_chave
STRIPE_WEBHOOK_SECRET=whsec_sua_chave
STRIPE_DEFAULT_CURRENCY=brl
```

## Instalar e rodar
```
npm install
npm run dev
```

## Migracoes Prisma
```
npx prisma migrate deploy
```

## Observacoes
- Rotas `/api` (exceto `/auth`, `/admin`, `/status`) exigem `Authorization: Bearer <token>`.
