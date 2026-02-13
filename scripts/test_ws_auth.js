const io = require('socket.io-client');

const URL = 'http://localhost:3000';

async function testWebSocketAuth() {
    console.log('--- Testando Autenticação WebSocket ---');

    // 1. Tentar conectar SEM token
    console.log('1. Tentando conectar SEM token...');
    const socketNoAuth = io(URL, {
        transports: ['websocket'],
        auth: {}, // Vazio
        reconnection: false
    });

    socketNoAuth.on('connect_error', (err) => {
        console.log('✅ Bloqueado como esperado:', err.message);
        socketNoAuth.close();
    });

    socketNoAuth.on('connect', () => {
        console.error('❌ ERRO: Conectou sem token! A segurança falhou.');
        socketNoAuth.close();
    });

    // Aguardar um pouco
    await new Promise(r => setTimeout(r, 2000));
    console.log('\nTeste finalizado.');
}

testWebSocketAuth();
