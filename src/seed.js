const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('123456', 10);

  const passageiro = await prisma.user.upsert({
    where: { email: 'passageiro@demo.com' },
    update: {},
    create: {
      nome: 'Passageiro Demo',
      email: 'passageiro@demo.com',
      senha: senhaHash,
      telefone: '11999990000',
      tipo: 'passageiro'
    }
  });

  const motorista = await prisma.user.upsert({
    where: { email: 'motorista@demo.com' },
    update: {},
    create: {
      nome: 'Motorista Demo',
      email: 'motorista@demo.com',
      senha: senhaHash,
      telefone: '11999990001',
      tipo: 'motorista',
      cnhStatus: 'aprovado'
    }
  });

  console.log('Seed concluido:');
  console.log('Passageiro:', passageiro.email);
  console.log('Motorista:', motorista.email);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());