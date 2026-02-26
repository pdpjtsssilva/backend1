const socketIo = require('socket.io');

// Memória temporária para gerenciar o estado em tempo real
const motoristasOnline = new Map();
const corridasAtivas = new Map();

const initializeWebSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Dispositivo conectado: ${socket.id}`);

        // Registro de Motorista Online
        socket.on('motorista:online', (data) => {
            const { motoristaId, nome, latitude, longitude } = data;
            socket.join('motoristas');
            motoristasOnline.set(socket.id, {
                motoristaId,
                nome: nome || 'Motorista',
                localizacao: { latitude, longitude },
                socketId: socket.id
            });
            console.log(`[SOCKET] Motorista ${nome || motoristaId} pronto.`);
        });

        // Registro de Passageiro
        socket.on('passageiro:entrar', ({ passageiroId }) => {
            socket.join('passageiros');
            console.log(`[SOCKET] Passageiro ${passageiroId} conectado.`);
        });

        // Solicitação inicial via Socket
        socket.on('passageiro:solicitarCorrida', (dados) => {
            const corridaId = dados.id || Date.now().toString();
            corridasAtivas.set(corridaId, { ...dados, status: 'aguardando' });
            console.log('[CORRIDA] Nova solicitação:', corridaId);
            io.to('motoristas').emit('corrida:novaSolicitacao', dados);
        });

        socket.on('disconnect', () => {
            motoristasOnline.delete(socket.id);
            console.log(`[SOCKET] Desconectado: ${socket.id}`);
        });
    });

    global.io = io; 
    return io;
};

// Funções de suporte chamadas pelas rotas HTTP
const getCorridasAtivas = () => {
    return corridasAtivas;
};

const emitirNovaSolicitacaoParaMotoristas = (dados) => {
    if (global.io) {
        corridasAtivas.set(dados.corridaId, { ...dados, status: 'aguardando' });
        global.io.to('motoristas').emit('corrida:novaSolicitacao', dados);
    }
};

/**
 * FUNÇÃO CRUCIAL: Remove a corrida da memória e avisa os Apps
 * para pararem de exibir a solicitação.
 */
const finalizarSolicitacaoNoSocket = (corridaId) => {
    if (global.io) {
        corridasAtivas.delete(corridaId);
        // Evento enviado para todos os motoristas esconderem o card desta corrida
        global.io.to('motoristas').emit('corrida:encerrada', { corridaId });
        console.log(`[SOCKET] Solicitação ${corridaId} encerrada no sistema.`);
    }
};

module.exports = { 
    initializeWebSocket, 
    getCorridasAtivas, 
    emitirNovaSolicitacaoParaMotoristas,
    finalizarSolicitacaoNoSocket 
};