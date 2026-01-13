// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { initializeWebSocket } = require('./websocket');

const app = express();
const server = http.createServer(app);

// Webhook Stripe precisa de raw body; conecte antes do express.json
const stripeWebhookRoute = require('./stripe-webhook');
app.use('/api/pagamentos', stripeWebhookRoute);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Inicializar WebSocket
initializeWebSocket(server);

// Rotas
const authRoutes = require('./routes/auth');
const corridasRoutes = require('./routes/corridas');
const favoritosRoutes = require('./routes/favoritos');
const pagamentosRoutes = require('./routes/pagamentos');
const carrosRoutes = require('./routes/carros');
const motoristasRoutes = require('./routes/motoristas');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/favoritos', favoritosRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/carros', carrosRoutes);
app.use('/api/motoristas', motoristasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', express.static(path.join(__dirname, '..', 'admin-panel')));

// Rota de status
app.get('/api/status', (_req, res) => {
  res.json({
    mensagem: 'API Uber Clone',
    websocket: 'Ativo',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor HTTP rodando', { port: PORT });
  console.log('WebSocket ativo na mesma porta');
  console.log('Endpoints REST principais:');
  console.log('   POST /api/auth/cadastro');
  console.log('   POST /api/auth/login');
  console.log('   POST /api/corridas/solicitar');
  console.log('   GET  /api/corridas/usuario/:id');
  console.log('   GET  /api/pagamentos/cartoes/:userId');
  console.log('   POST /api/pagamentos/cartoes');
  console.log('   GET  /api/pagamentos/carteira/:userId');
  console.log('   POST /api/pagamentos/carteira/adicionar');
  console.log('   POST /api/pagamentos/pagar');
  console.log('   GET  /api/status');
  console.log('Eventos WebSocket: motorista:online, passageiro:solicitarCorrida, motorista:aceitarCorrida, motorista:atualizarPosicao');
});
