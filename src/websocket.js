const socketIo = require('socket.io');

// Memoria temporaria para gerenciar o estado em tempo real
const motoristasOnline = new Map();
const corridasAtivas = new Map();

const initializeWebSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    const origin = socket.handshake.headers?.origin || 'N/A';
    const ua = socket.handshake.headers?.['user-agent'] || 'N/A';
    const authHeader = socket.handshake.headers?.authorization || 'N/A';
    console.log(`[SOCKET] Dispositivo conectado: ${socket.id}`);
    console.log(`[SOCKET] Origin: ${origin} | UA: ${ua} | Auth: ${authHeader}`);

    // Registro de Motorista Online
    socket.on('motorista:online', (data) => {
      const { motoristaId, nome, latitude, longitude } = data;
      console.log('[SOCKET] motorista:online', { motoristaId, nome, latitude, longitude });
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
      console.log('[SOCKET] passageiro:entrar', { passageiroId });
      console.log(`[SOCKET] Passageiro ${passageiroId} conectado.`);
    });

    // Solicitacao inicial via Socket
    socket.on('passageiro:solicitarCorrida', (dados) => {
      const corridaId = dados.id || Date.now().toString();
      corridasAtivas.set(corridaId, { ...dados, status: 'aguardando' });
      console.log('[CORRIDA] Nova solicitacao:', corridaId);
      console.log('[CORRIDA] Payload:', dados);
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

// Funcoes de suporte chamadas pelas rotas HTTP
const getCorridasAtivas = () => {
  return corridasAtivas;
};

const emitirNovaSolicitacaoParaMotoristas = (dados) => {
  if (global.io) {
    corridasAtivas.set(dados.corridaId, { ...dados, status: 'aguardando' });
    global.io.to('motoristas').emit('corrida:novaSolicitacao', dados);
  }
};

// Remove corrida da memoria e avisa apps
const finalizarSolicitacaoNoSocket = (corridaId) => {
  if (global.io) {
    corridasAtivas.delete(corridaId);
    global.io.to('motoristas').emit('corrida:encerrada', { corridaId });
    console.log(`[SOCKET] Solicitacao ${corridaId} encerrada no sistema.`);
  }
};

module.exports = {
  initializeWebSocket,
  getCorridasAtivas,
  corridasAtivas,
  emitirNovaSolicitacaoParaMotoristas,
  finalizarSolicitacaoNoSocket
};