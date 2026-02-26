const socketIo = require('socket.io');

const motoristasOnline = new Map();

// Definimos a função com o nome que o seu server.js usa
const initializeWebSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo dispositivo conectado: ${socket.id}`);

        // Eventos baseados no seu arquivo mobile/src/services/websocket.js
        socket.on('motorista:online', (data) => {
            const { motoristaId, nome, latitude, longitude } = data;
            socket.join('motoristas');
            motoristasOnline.set(socket.id, {
                motoristaId,
                nome: nome || 'Motorista',
                localizacao: { latitude, longitude },
                socketId: socket.id
            });
            console.log(`[SOCKET] Motorista ${nome || motoristaId} pronto para receber chamadas.`);
        });

        socket.on('passageiro:entrar', ({ passageiroId }) => {
            socket.join('passageiros');
            console.log(`[SOCKET] Passageiro ${passageiroId} conectado.`);
        });

        socket.on('passageiro:solicitarCorrida', (dados) => {
            console.log('[CORRIDA] Nova solicitação recebida:', dados);
            io.to('motoristas').emit('corrida:novaSolicitacao', dados);
        });

        socket.on('disconnect', () => {
            if (motoristasOnline.has(socket.id)) {
                motoristasOnline.delete(socket.id);
            }
            console.log(`[SOCKET] Dispositivo desconectado: ${socket.id}`);
        });
    });

    return io;
};

// EXPORTAÇÃO CORRIGIDA: Exporta como um objeto para o destructuring no server.js funcionar
module.exports = { initializeWebSocket };