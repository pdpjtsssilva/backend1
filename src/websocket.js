const socketIo = require('socket.io');

// Memoria temporaria para gerenciar o estado em tempo real
const motoristasOnline = new Map();
const passageirosOnline = new Map();
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
      if (passageiroId) {
        passageirosOnline.set(passageiroId, socket.id);
      }
      console.log('[SOCKET] passageiro:entrar', { passageiroId });
      console.log(`[SOCKET] Passageiro ${passageiroId} conectado.`);
    });

    // Solicitacao inicial via Socket
    socket.on('passageiro:solicitarCorrida', (dados) => {
      const corridaId = dados.id || Date.now().toString();
      const passageiroSocket = passageirosOnline.get(dados.passageiroId) || socket.id;
      corridasAtivas.set(corridaId, { ...dados, corridaId, passageiroSocket, status: 'aguardando', createdAt: Date.now() });
      console.log('[CORRIDA] Nova solicitacao:', corridaId);
      console.log('[CORRIDA] Payload:', dados);
      io.to('motoristas').emit('corrida:novaSolicitacao', dados);
    });

    // Motorista aceita corrida
    socket.on('motorista:aceitarCorrida', (dados) => {
      const { corridaId, motoristaId, motoristaNome, motoristaLocalizacao } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const atualizado = {
        ...atual,
        motoristaId,
        motoristaNome,
        motoristaLocalizacao,
        status: 'aceita'
      };
      corridasAtivas.set(corridaId, atualizado);

      // Notificar passageiro
      const passageiroSocket = atualizado.passageiroSocket || passageirosOnline.get(atualizado.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('corrida:aceita', {
          corridaId,
          motoristaId,
          motoristaNome,
          motoristaLocalizacao
        });
      } else {
        io.emit('corrida:aceita', { corridaId, motoristaId, motoristaNome, motoristaLocalizacao });
      }

      // Confirmar ao motorista
      io.to(socket.id).emit('motorista:corridaConfirmada', {
        corridaId,
        status: 'aceita',
        destinoLat: atualizado.destino?.latitude,
        destinoLng: atualizado.destino?.longitude,
        destinoEndereco: atualizado.destinoEndereco,
        origemEndereco: atualizado.origemEndereco
      });
    });

    // Motorista chegou na origem
    socket.on('motorista:chegouOrigem', (dados) => {
      const { corridaId } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const atualizado = { ...atual, status: 'chegou' };
      corridasAtivas.set(corridaId, atualizado);
      const passageiroSocket = atualizado.passageiroSocket || passageirosOnline.get(atualizado.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('motorista:chegou', { corridaId });
      } else {
        io.emit('motorista:chegou', { corridaId });
      }
    });

    // Motorista inicia corrida
    socket.on('motorista:iniciarCorrida', (dados) => {
      const { corridaId } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const atualizado = { ...atual, status: 'em_andamento' };
      corridasAtivas.set(corridaId, atualizado);
      const passageiroSocket = atualizado.passageiroSocket || passageirosOnline.get(atualizado.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('corrida:iniciada', { corridaId });
      } else {
        io.emit('corrida:iniciada', { corridaId });
      }
    });

    socket.on('disconnect', () => {
      motoristasOnline.delete(socket.id);
      passageirosOnline.forEach((sockId, passageiroId) => {
        if (sockId === socket.id) {
          passageirosOnline.delete(passageiroId);
          // Remove corridas ativas desse passageiro
          Array.from(corridasAtivas.entries()).forEach(([cid, c]) => {
            if (c?.passageiroId === passageiroId) corridasAtivas.delete(cid);
          });
        }
      });
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
