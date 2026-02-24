const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeWebSocket } = require('./websocket');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Servir Painel Admin
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

// Rotas API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Inicializar WebSocket
initializeWebSocket(server);

app.get('/api/status', (req, res) => {
    res.json({ mensagem: "API Uber Clone L'europe", websocket: "Ativo" });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});