const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('123456', 10);

  const user = await prisma.user.upsert({
    where: { email: 'teste@email.com' },
    update: {},
    create: {
      nome: 'Usuário Teste',
      email: 'teste@email.com',
      senha: senhaHash,
      telefone: '1234567890'
    }
  });

  console.log('Usuário de seed pronto:', user.email);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
