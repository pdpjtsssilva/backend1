const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const SOCKET_URL = 'http://localhost:3002'; // Local backend
const JWT_SECRET = 'troque_por_uma_chave_forte';

// Helper to create token
const createToken = (id, tipo) => {
    return jwt.sign({ id, email: `${tipo}@test.com`, tipo }, JWT_SECRET, { expiresIn: '1h' });
};

const motoristaId = 'motorista_debug_1';
const passageiroId = 'passageiro_debug_1';

const tokenMotorista = createToken(motoristaId, 'motorista');
const tokenPassageiro = createToken(passageiroId, 'passageiro');

console.log('--- Iniciando Teste de Dispatch ---');

// 1. Conectar Motorista
const socketMotorista = io(SOCKET_URL, {
    auth: { token: tokenMotorista },
    transports: ['websocket']
});

socketMotorista.on('connect', () => {
    console.log('✅ Motorista conectado:', socketMotorista.id);

    // Ficar Online
    socketMotorista.emit('motorista:online', {
        motoristaId,
        nome: 'Motorista Debug',
        latitude: -23.5505,
        longitude: -46.6333
    });
});

socketMotorista.on('motorista:online', (data) => {
    console.log('✅ Motorista confirmado online:', data.motoristaId);
    iniciarPassageiro();
});

socketMotorista.on('corrida:novaSolicitacao', (data) => {
    console.log('🎉 SUCESSO! Motorista recebeu solicitacao:', data.corridaId);
    process.exit(0);
});

socketMotorista.on('connect_error', (err) => {
    console.error('❌ Erro conexao Motorista:', err.message);
});

// 2. Conectar Passageiro e Solicitar
function iniciarPassageiro() {
    const socketPassageiro = io(SOCKET_URL, {
        auth: { token: tokenPassageiro },
        transports: ['websocket']
    });

    socketPassageiro.on('connect', () => {
        console.log('✅ Passageiro conectado:', socketPassageiro.id);

        // Solicitar Corrida
        const corridaId = `corrida_debug_${Date.now()}`;
        console.log('🚀 Solicitando corrida:', corridaId);

        socketPassageiro.emit('passageiro:solicitarCorrida', {
            corridaId,
            passageiroId,
            passageiroNome: 'Passageiro Debug',
            origem: { latitude: -23.5505, longitude: -46.6333 },
            destino: { latitude: -23.5605, longitude: -46.6433 },
            origemEndereco: 'Origem Teste',
            destinoEndereco: 'Destino Teste',
            preco: 15.50
        });
    });

    socketPassageiro.on('connect_error', (err) => {
        console.error('❌ Erro conexao Passageiro:', err.message);
    });
}

// Timeout de segurança
setTimeout(() => {
    console.error('❌ TIMEOUT: Motorista não recebeu solicitação em 10s.');
    process.exit(1);
}, 10000);
