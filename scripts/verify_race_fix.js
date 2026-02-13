require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testRaceCondition() {
    console.log('--- Testando Correção de Race Condition ---');

    // 1. Criar um passageiro dummy
    const passageiro = await prisma.user.create({
        data: {
            nome: 'Teste Race',
            email: `teste.race.${Date.now()}@exemplo.com`,
            senha: '123',
            tipo: 'passageiro'
        }
    });

    // 2. Criar uma corrida dummy
    const corrida = await prisma.corrida.create({
        data: {
            passageiroId: passageiro.id,
            origemLat: -23.5505,
            origemLng: -46.6333,
            origemEndereco: 'Origem Teste',
            destinoLat: -23.5505,
            destinoLng: -46.6333,
            destinoEndereco: 'Destino Teste',
            distancia: 10,
            preco: 20,
            status: 'aguardando'
        }
    });

    console.log(`Corrida criada: ${corrida.id} (status: ${corrida.status})`);

    // 3. Simular tentativa de aceite via updateMany (replicando a lógica da rota)
    const aceitarCorrida = async (motoristaNome) => {
        const resultado = await prisma.corrida.updateMany({
            where: { id: corrida.id, status: 'aguardando' },
            data: { status: 'aceita', canceladoPor: motoristaNome } // Usando canceladoPor temporariamente para identificar quem ganhou for simplicity
        });
        return resultado.count; // 1 se aceitou, 0 se falhou
    };

    // 4. Executar concorrentemente
    console.log('Iniciando tentativas concorrentes de aceite...');
    const promessa1 = aceitarCorrida('Motorista 1');
    const promessa2 = aceitarCorrida('Motorista 2');

    const [resultado1, resultado2] = await Promise.all([promessa1, promessa2]);

    console.log(`Motorista 1 conseguiu? ${resultado1 === 1 ? 'SIM' : 'NÃO'}`);
    console.log(`Motorista 2 conseguiu? ${resultado2 === 1 ? 'SIM' : 'NÃO'}`);

    if (resultado1 + resultado2 === 1) {
        console.log('✅ SUCESSO: Apenas um motorista conseguiu aceitar a corrida!');
    } else {
        console.log('❌ FALHA: Comportamento inesperado (ambos ou nenhum aceitou).');
    }

    // Limpeza
    await prisma.corrida.delete({ where: { id: corrida.id } });
    await prisma.user.delete({ where: { id: passageiro.id } });
    await prisma.$disconnect();
}

testRaceCondition().catch(e => {
    console.error(e);
    process.exit(1);
});
