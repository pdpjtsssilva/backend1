const socketIo = require('socket.io');

// Memória temporária para corridas e motoristas
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

        // Motorista entra online
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

        // Passageiro entra no sistema
        socket.on('passageiro:entrar', ({ passageiroId }) => {
            socket.join('passageiros');
            console.log(`[SOCKET] Passageiro ${passageiroId} conectado.`);
        });

        // Solicitação de corrida
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

    // Função interna para o arquivo de rotas emitir eventos
    global.io = io; 

    return io;
};

// --- FUNÇÕES DE SUPORTE PARA AS ROTAS (corridas.js) ---

const getCorridasAtivas = () => {
    return corridasAtivas;
};

const emitirNovaSolicitacaoParaMotoristas = (dados) => {
    if (global.io) {
        // Guarda na memória para a rota /abertas conseguir listar
        corridasAtivas.set(dados.corridaId, { ...dados, status: 'aguardando' });
        // Envia via socket para os motoristas online
        global.io.to('motoristas').emit('corrida:novaSolicitacao', dados);
    }
};

// Exportamos tudo o que o server.js e o corridas.js precisam
module.exports = { 
    initializeWebSocket, 
    getCorridasAtivas, 
    emitirNovaSolicitacaoParaMotoristas 
};