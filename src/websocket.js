const socketIo = require('socket.io');

// Memoria temporaria para gerenciar o estado em tempo real
// motoristasOnline: Map<motoristaId, { ... }>
const motoristasOnline = new Map();
// passageirosOnline: Map<passageiroId, socketId>
const passageirosOnline = new Map();
// corridasAtivas: Map<corridaId, { ... }>
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
      const { motoristaId, nome, latitude, longitude, localizacao } = data || {};
      if (!motoristaId) return;
      console.log('[SOCKET] motorista:online', { motoristaId, nome, latitude, longitude });
      socket.join('motoristas');
      motoristasOnline.set(motoristaId, {
        motoristaId,
        nome: nome || 'Motorista',
        localizacao: localizacao || { latitude, longitude },
        socketId: socket.id,
        disponivel: true,
        corridaAtual: null
      });
      const lista = Array.from(motoristasOnline.values()).map((m) => ({
        motoristaId: m.motoristaId,
        nome: m.nome,
        localizacao: m.localizacao || null
      }));
      io.emit('motorista:online', { motoristaId, nome, localizacao: localizacao || { latitude, longitude } });
      io.emit('motoristas:online', lista);
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
    socket.on('passageiro:online', ({ passageiroId }) => {
      if (passageiroId) {
        passageirosOnline.set(passageiroId, socket.id);
      }
      console.log('[SOCKET] passageiro:online', { passageiroId });
    });

    // Solicitacao inicial via Socket
    socket.on('passageiro:solicitarCorrida', (dados) => {
      const corridaId = dados?.corridaId || dados?.id || Date.now().toString();
      const passageiroSocket = passageirosOnline.get(dados?.passageiroId) || socket.id;
      corridasAtivas.set(corridaId, {
        ...dados,
        corridaId,
        passageiroSocket,
        status: 'aguardando',
        createdAt: Date.now(),
        recusados: []
      });
      console.log('[CORRIDA] Nova solicitacao:', corridaId);
      console.log('[CORRIDA] Payload:', dados);
      io.to('motoristas').emit('corrida:novaSolicitacao', { ...dados, corridaId });
    });

    // Motorista aceita corrida
    socket.on('motorista:aceitarCorrida', (dados) => {
      const { corridaId, motoristaId, motoristaNome, motoristaLocalizacao, motoristaLat, motoristaLng } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const atualizado = {
        ...atual,
        motoristaId,
        motoristaNome,
        motoristaLocalizacao: motoristaLocalizacao || (motoristaLat && motoristaLng ? { latitude: motoristaLat, longitude: motoristaLng } : null),
        status: 'aceita'
      };
      corridasAtivas.set(corridaId, atualizado);
      const motorista = motoristasOnline.get(motoristaId);
      if (motorista) {
        motorista.disponivel = false;
        motorista.corridaAtual = corridaId;
      }

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

    socket.on('motorista:finalizarCorrida', (dados) => {
      const { corridaId } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const atualizado = { ...atual, status: 'finalizada' };
      corridasAtivas.set(corridaId, atualizado);
      const passageiroSocket = atualizado.passageiroSocket || passageirosOnline.get(atualizado.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('corrida:finalizada', { corridaId });
      } else {
        io.emit('corrida:finalizada', { corridaId });
      }
      if (atualizado.motoristaId) {
        const motorista = motoristasOnline.get(atualizado.motoristaId);
        if (motorista) {
          motorista.disponivel = true;
          motorista.corridaAtual = null;
        }
      }
      corridasAtivas.delete(corridaId);
    });

    socket.on('motorista:recusarCorrida', (dados) => {
      const { corridaId, motoristaId } = dados || {};
      if (!corridaId) return;
      const atual = corridasAtivas.get(corridaId) || {};
      const recusados = Array.isArray(atual.recusados) ? atual.recusados : [];
      if (motoristaId && !recusados.includes(motoristaId)) recusados.push(motoristaId);
      corridasAtivas.set(corridaId, { ...atual, recusados, status: 'aguardando' });
      const passageiroSocket = atual.passageiroSocket || passageirosOnline.get(atual.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('corrida:recusada', { corridaId, motoristaId });
      }
    });

    socket.on('motorista:atualizarPosicao', (dados) => {
      const { motoristaId, localizacao, distancia, tempoEstimado } = dados || {};
      if (!motoristaId || !localizacao) return;
      const motorista = motoristasOnline.get(motoristaId);
      if (motorista) {
        motorista.localizacao = localizacao;
      }
      io.emit('motorista:posicaoOnline', { motoristaId, localizacao });
      if (motorista?.corridaAtual) {
        const corrida = corridasAtivas.get(motorista.corridaAtual);
        const passageiroSocket = corrida?.passageiroSocket || passageirosOnline.get(corrida?.passageiroId);
        if (passageiroSocket) {
          io.to(passageiroSocket).emit('motorista:posicaoAtualizada', {
            corridaId: motorista.corridaAtual,
            localizacao,
            distancia,
            tempoEstimado
          });
        }
      }
    });

    socket.on('motorista:offline', (dados) => {
      const motoristaId = dados?.motoristaId;
      if (!motoristaId) return;
      const motorista = motoristasOnline.get(motoristaId);
      if (motorista && motorista.socketId === socket.id) {
        motoristasOnline.delete(motoristaId);
      }
      io.emit('motorista:offline', { motoristaId });
    });

    socket.on('disconnect', () => {
      let offlineMotoristaId = null;
      motoristasOnline.forEach((m, id) => {
        if (m.socketId === socket.id) offlineMotoristaId = id;
      });
      if (offlineMotoristaId) {
        const motorista = motoristasOnline.get(offlineMotoristaId);
        motoristasOnline.delete(offlineMotoristaId);
        io.emit('motorista:offline', { motoristaId: offlineMotoristaId });
        if (motorista?.corridaAtual) {
          const corrida = corridasAtivas.get(motorista.corridaAtual);
          if (corrida?.passageiroSocket) {
            io.to(corrida.passageiroSocket).emit('corrida:cancelada', {
              corridaId: motorista.corridaAtual,
              motivo: 'motorista_offline'
            });
          }
        }
      }
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
  motoristasOnline,
  emitirNovaSolicitacaoParaMotoristas,
  finalizarSolicitacaoNoSocket
};
