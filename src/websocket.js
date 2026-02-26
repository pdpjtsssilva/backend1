const socketIo = require('socket.io');

const motoristasOnline = new Map();

// O nome da função deve ser exatamente inicializarWebSocket para bater com o seu server.js
const inicializarWebSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo dispositivo conectado: ${socket.id}`);

        // Evento que o seu APK Mobile envia quando o motorista loga
        socket.on('motorista:online', (data) => {
            const { motoristaId, nome, latitude, longitude } = data;
            
            // Coloca o socket na sala de motoristas para receber pedidos
            socket.join('motoristas');
            
            // Salva o motorista na memória do servidor
            motoristasOnline.set(socket.id, {
                motoristaId,
                nome: nome || 'Motorista',
                localizacao: { latitude, longitude },
                socketId: socket.id
            });

            console.log(`[SOCKET] Motorista ${nome || motoristaId} pronto para receber chamadas.`);
        });

        // Evento que o seu APK Mobile envia quando o passageiro entra
        socket.on('passageiro:entrar', ({ passageiroId }) => {
            socket.join('passageiros');
            console.log(`[SOCKET] Passageiro ${passageiroId} conectado e na sala.`);
        });

        // Evento de solicitação de corrida vindo do Mobile
        socket.on('passageiro:solicitarCorrida', (dados) => {
            console.log('[CORRIDA] Nova solicitação recebida:', dados);
            
            // Envia a notificação apenas para quem está na sala 'motoristas'
            io.to('motoristas').emit('corrida:novaSolicitacao', {
                ...dados,
                id: dados.id || Date.now().toString(),
                status: 'aberta'
            });
        });

        // Evento de aceite de corrida vindo do Mobile
        socket.on('motorista:aceitarCorrida', (data) => {
            console.log('[CORRIDA] Motorista aceitou o pedido:', data);
            // Avisa o passageiro (e a todos) que a corrida foi aceita
            io.emit('corrida:aceita', data);
        });

        // Atualização de posição em tempo real
        socket.on('motorista:atualizarPosicao', (data) => {
            if (motoristasOnline.has(socket.id)) {
                motoristasOnline.get(socket.id).localizacao = { 
                    latitude: data.latitude, 
                    longitude: data.longitude 
                };
            }
            io.emit('motorista:posicaoAtualizada', data);
        });

        socket.on('disconnect', () => {
            if (motoristasOnline.has(socket.id)) {
                const motorista = motoristasOnline.get(socket.id);
                console.log(`[SOCKET] Motorista ${motorista.nome} desconectado.`);
                motoristasOnline.delete(socket.id);
            }
            console.log(`[SOCKET] Dispositivo desconectado: ${socket.id}`);
        });
    });

    return io;
};

// Exporta com o nome que o server.js está importando
module.exports = inicializarWebSocket;