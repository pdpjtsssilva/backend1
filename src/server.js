const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeWebSocket } = require('./websocket');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const corridasRoutes = require('./routes/corridas');
const motoristasRoutes = require('./routes/motoristas');
const carrosRoutes = require('./routes/carros');
const pagamentosRoutes = require('./routes/pagamentos');
const favoritosRoutes = require('./routes/favoritos');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Servir Painel Admin
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

// Rotas API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/motoristas', motoristasRoutes);
app.use('/api/carros', carrosRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/favoritos', favoritosRoutes);

// Inicializar WebSocket
initializeWebSocket(server);

app.get('/api/status', (req, res) => {
  res.json({ mensagem: "API Uber Clone L'europe", websocket: "Ativo" });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {  // ← '0.0.0.0' resolve o erro do Render
  console.log(`Servidor rodando na porta ${PORT}`);
});