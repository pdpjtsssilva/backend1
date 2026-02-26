const socketIo = require('socket.io');

const motoristasOnline = new Map();

const setupWebSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo dispositivo conectado: ${socket.id}`);

        // --- COMPATIBILIDADE COM O SEU APP MOBILE ---

        // 1. Quando o Motorista fica Online (vê o log no Render agora)
        socket.on('motorista:online', (data) => {
            const { motoristaId, nome, latitude, longitude } = data;
            
            // Coloca o socket na sala técnica de motoristas
            socket.join('motoristas');
            
            // Salva na memória do servidor
            motoristasOnline.set(socket.id, {
                motoristaId,
                nome: nome || 'Motorista',
                localizacao: { latitude, longitude },
                socketId: socket.id
            });

            console.log(`[SOCKET] Motorista ${nome || motoristaId} pronto para receber chamadas.`);
            
            // Avisa outros (opcional, se o seu app usar)
            io.emit('motorista:online', data);
        });

        // 2. Quando o Passageiro entra no App
        socket.on('passageiro:entrar', ({ passageiroId }) => {
            socket.join('passageiros');
            console.log(`[SOCKET] Passageiro ${passageiroId} conectado e aguardando.`);
        });

        // 3. Quando o Passageiro solicita a corrida pelo Socket
        socket.on('passageiro:solicitarCorrida', (dados) => {
            console.log('[CORRIDA] Nova solicitação recebida via Socket:', dados);
            
            // Envia para TODOS os motoristas que estão na sala 'motoristas'
            io.to('motoristas').emit('corrida:novaSolicitacao', {
                ...dados,
                id: Date.now().toString(), // Gera um ID temporário se não vier um
                status: 'aberta'
            });
        });

        // 4. Quando o Motorista aceita a corrida
        socket.on('motorista:aceitarCorrida', (data) => {
            console.log('[CORRIDA] Motorista aceitou:', data);
            // Avisa o passageiro específico
            io.emit('corrida:aceita', data);
        });

        // 5. Atualização de posição do motorista
        socket.on('motorista:atualizarPosicao', (data) => {
            motoristasOnline.set(socket.id, {
                ...motoristasOnline.get(socket.id),
                localizacao: { latitude: data.latitude, longitude: data.longitude }
            });
            // Opcional: enviar posição para o passageiro em tempo real
            io.emit('motorista:posicaoAtualizada', data);
        });

        // --- DESCONEXÃO ---
        socket.on('disconnect', () => {
            if (motoristasOnline.has(socket.id)) {
                const motorista = motoristasOnline.get(socket.id);
                console.log(`[SOCKET] Motorista ${motorista.nome} saiu.`);
                motoristasOnline.delete(socket.id);
            }
            console.log(`[SOCKET] Dispositivo desconectado: ${socket.id}`);
        });
    });

    return io;
};

module.exports = setupWebSocket;