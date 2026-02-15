const jwt = require('jsonwebtoken');

module.exports = (io) => {
  const motoristasOnline = new Map();
  const passageirosOnline = new Map();
  const corridasAtivas = new Map();

  const emitAdmin = (event, data) => {
    io.emit(event, data);
  };

  // 🔍 LOG: Mostrar motoristas online
  const logMotoristasOnline = () => {
    console.log('='.repeat(80));
    console.log('📊 MOTORISTAS ONLINE NO MOMENTO:', motoristasOnline.size);
    motoristasOnline.forEach((motorista, id) => {
      console.log(`  - ID: ${id}`);
      console.log(`    Nome: ${motorista.nome}`);
      console.log(`    Socket: ${motorista.socketId}`);
      console.log(`    Disponível: ${motorista.disponivel}`);
      console.log(`    Corrida Atual: ${motorista.corridaAtual || 'nenhuma'}`);
    });
    console.log('='.repeat(80));
  };

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    
    if (!token) {
      console.log(`Conexão sem token permitida (Admin ou app): ${socket.id}`);
      socket.user = null;
      return next();
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      console.log(`Conexão autenticada via JWT: ${decoded.userId}`);
      next();
    } catch (err) {
      console.error('Token inválido:', err.message);
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log('✅ Cliente conectado:', socket.id);

    socket.on('disconnect', () => {
      console.log('❌ Cliente desconectado:', socket.id);
      
      for (const [motoristaId, motorista] of motoristasOnline.entries()) {
        if (motorista.socketId === socket.id) {
          motoristasOnline.delete(motoristaId);
          io.emit('motorista:offline', { motoristaId });
          emitAdmin('admin:motoristaOffline', { motoristaId });
          console.log(`Motorista ${motoristaId} saiu`);
          logMotoristasOnline();
          break;
        }
      }
      
      for (const [passageiroId, passageiro] of passageirosOnline.entries()) {
        if (passageiro.socketId === socket.id) {
          passageirosOnline.delete(passageiroId);
          console.log(`Passageiro ${passageiroId} saiu`);
          break;
        }
      }
    });

    socket.on('passageiro:online', (data) => {
      console.log('📲 Passageiro online:', data.passageiroId);
      passageirosOnline.set(data.passageiroId, {
        passageiroId: data.passageiroId,
        socketId: socket.id
      });
    });

    socket.on('motorista:online', (data) => {
      console.log('='.repeat(80));
      console.log('🚗 MOTORISTA FICANDO ONLINE');
      console.log('Dados recebidos:', JSON.stringify(data, null, 2));
      console.log('Socket ID:', socket.id);
      
      motoristasOnline.set(data.motoristaId, {
        motoristaId: data.motoristaId,
        nome: data.nome,
        socketId: socket.id,
        localizacao: data.localizacao,
        disponivel: true,
        corridaAtual: null
      });
      
      console.log('✅ Motorista adicionado ao Map');
      logMotoristasOnline();
      
      io.emit('motorista:online', {
        motoristaId: data.motoristaId,
        nome: data.nome,
        localizacao: data.localizacao
      });
      
      emitAdmin('admin:motoristaOnline', {
        motoristaId: data.motoristaId,
        nome: data.nome,
        localizacao: data.localizacao
      });

      const lista = Array.from(motoristasOnline.values()).map(m => ({
        motoristaId: m.motoristaId,
        nome: m.nome,
        localizacao: m.localizacao
      }));
      socket.emit('motoristas:online', lista);
      console.log('='.repeat(80));
    });

    socket.on('motorista:offline', (data) => {
      console.log('👋 Motorista offline:', data.motoristaId);
      motoristasOnline.delete(data.motoristaId);
      io.emit('motorista:offline', { motoristaId: data.motoristaId });
      emitAdmin('admin:motoristaOffline', { motoristaId: data.motoristaId });
      logMotoristasOnline();
    });

    socket.on('motorista:atualizarPosicao', (data) => {
      const motorista = motoristasOnline.get(data.motoristaId);
      if (motorista) {
        motorista.localizacao = data.localizacao;
        
        io.emit('motorista:posicaoOnline', {
          motoristaId: data.motoristaId,
          localizacao: data.localizacao
        });

        if (motorista.corridaAtual) {
          const corrida = corridasAtivas.get(motorista.corridaAtual);
          if (corrida && corrida.passageiroSocket) {
            io.to(corrida.passageiroSocket).emit('motorista:posicaoAtualizada', {
              corridaId: motorista.corridaAtual,
              localizacao: data.localizacao,
              distancia: data.distancia,
              tempoEstimado: data.tempoEstimado
            });
          }
        }
      }
    });

    socket.on('passageiro:solicitarCorrida', (data) => {
      console.log('='.repeat(80));
      console.log('📞 PASSAGEIRO SOLICITOU CORRIDA');
      console.log('Dados:', JSON.stringify(data, null, 2));
      
      corridasAtivas.set(data.corridaId, {
        corridaId: data.corridaId,
        passageiroId: data.passageiroId,
        passageiroNome: data.passageiroNome,
        passageiroSocket: socket.id,
        origem: data.origem,
        destino: data.destino,
        origemEndereco: data.origemEndereco,
        destinoEndereco: data.destinoEndereco,
        preco: data.preco,
        status: 'aguardando',
        recusados: []
      });
      
      emitAdmin('admin:corridaNova', {
        corridaId: data.corridaId,
        passageiroId: data.passageiroId,
        origem: data.origem,
        destino: data.destino,
        preco: data.preco,
        status: 'aguardando'
      });

      console.log('📡 Procurando motoristas disponíveis...');
      logMotoristasOnline();
      
      let enviados = 0;
      motoristasOnline.forEach((motorista, motoristaId) => {
        console.log(`  Verificando motorista ${motoristaId}:`);
        console.log(`    - Disponível: ${motorista.disponivel}`);
        console.log(`    - Corrida atual: ${motorista.corridaAtual}`);
        
        if (motorista.disponivel && !motorista.corridaAtual) {
          console.log(`    ✅ Enviando para ${motoristaId} (socket: ${motorista.socketId})`);
          io.to(motorista.socketId).emit('corrida:novaSolicitacao', data);
          enviados++;
        } else {
          console.log(`    ❌ NÃO enviado (não disponível ou em corrida)`);
        }
      });
      
      console.log(`📊 Total de motoristas que receberam: ${enviados}`);
      console.log('='.repeat(80));
    });

    socket.on('motorista:aceitarCorrida', (data) => {
      console.log('='.repeat(80));
      console.log('🟢 MOTORISTA ACEITOU CORRIDA');
      console.log('Corrida ID:', data.corridaId);
      console.log('Motorista ID:', data.motoristaId);
      console.log('Dados completos:', JSON.stringify(data, null, 2));
      
      const corrida = corridasAtivas.get(data.corridaId) || {};
      const passageiroSocket = corrida.passageiroSocket;
      
      corridasAtivas.set(data.corridaId, {
        ...corrida,
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaSocket: socket.id,
        motoristaLocalizacao: data.motoristaLocalizacao,
        motoristaLat: data.motoristaLat,
        motoristaLng: data.motoristaLng,
        status: 'aceita'
      });

      const motorista = motoristasOnline.get(data.motoristaId);
      if (motorista) {
        motorista.disponivel = false;
        motorista.corridaAtual = data.corridaId;
        console.log(`✅ Motorista ${data.motoristaId} marcado como indisponível`);
      }

      const eventData = {
        corridaId: data.corridaId,
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaLocalizacao: data.motoristaLocalizacao,
        motoristaLat: data.motoristaLat,
        motoristaLng: data.motoristaLng
      };

      console.log('📡 ENVIANDO corrida:aceita');
      console.log('Total de sockets:', io.sockets.sockets.size);
      console.log('Dados:', JSON.stringify(eventData, null, 2));
      
      io.emit('corrida:aceita', eventData);
      console.log('✅ Broadcast enviado');
      
      if (passageiroSocket) {
        console.log('📲 Enviando direto para passageiro:', passageiroSocket);
        io.to(passageiroSocket).emit('corrida:aceita', eventData);
        console.log('✅ Enviado direto');
      } else {
        console.warn('⚠️ Socket do passageiro não encontrado!');
      }

      emitAdmin('admin:corridaAtualizada', {
        corridaId: data.corridaId,
        status: 'aceita',
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaLocalizacao: data.motoristaLocalizacao
      });
      
      console.log('✅ EVENTO corrida:aceita ENVIADO');
      console.log('='.repeat(80));
    });

    socket.on('motorista:recusarCorrida', (data) => {
      console.log('❌ Motorista recusou corrida:', data.corridaId);
      const corrida = corridasAtivas.get(data.corridaId);
      if (corrida) {
        corrida.recusados = corrida.recusados || [];
        corrida.recusados.push(data.motoristaId);
        
        if (corrida.passageiroSocket) {
          io.to(corrida.passageiroSocket).emit('corrida:recusada', {
            corridaId: data.corridaId,
            motoristaId: data.motoristaId
          });
        }
      }
    });

    socket.on('motorista:chegouOrigem', (data) => {
      console.log('🚗 Motorista chegou na origem:', data.corridaId);
      const corrida = corridasAtivas.get(data.corridaId);
      if (corrida) {
        corrida.status = 'chegou';
        if (corrida.passageiroSocket) {
          io.to(corrida.passageiroSocket).emit('corrida:motoristachegou', {
            corridaId: data.corridaId
          });
        }
        emitAdmin('admin:corridaAtualizada', {
          corridaId: data.corridaId,
          status: 'chegou'
        });
      }
    });

    socket.on('motorista:iniciarCorrida', (data) => {
      console.log('🚀 Motorista iniciou corrida:', data.corridaId);
      const corrida = corridasAtivas.get(data.corridaId);
      if (corrida) {
        corrida.status = 'em_andamento';
        if (corrida.passageiroSocket) {
          io.to(corrida.passageiroSocket).emit('corrida:iniciada', {
            corridaId: data.corridaId
          });
        }
        emitAdmin('admin:corridaAtualizada', {
          corridaId: data.corridaId,
          status: 'em_andamento'
        });
      }
    });

    socket.on('motorista:finalizarCorrida', (data) => {
      console.log('🏁 Motorista finalizou corrida:', data.corridaId);
      const corrida = corridasAtivas.get(data.corridaId);
      if (corrida) {
        corrida.status = 'finalizada';
        if (corrida.passageiroSocket) {
          io.to(corrida.passageiroSocket).emit('corrida:finalizada', {
            corridaId: data.corridaId
          });
        }

        const motorista = motoristasOnline.get(corrida.motoristaId);
        if (motorista) {
          motorista.disponivel = true;
          motorista.corridaAtual = null;
          console.log(`✅ Motorista ${corrida.motoristaId} disponível novamente`);
          logMotoristasOnline();
        }

        emitAdmin('admin:corridaAtualizada', {
          corridaId: data.corridaId,
          status: 'finalizada'
        });

        corridasAtivas.delete(data.corridaId);
      }
    });
  });

  console.log('✅ WebSocket configurado com LOGS DE DEBUG');
};