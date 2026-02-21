const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

// Importação da lógica de WebSocket
const { initializeWebSocket } = require('./websocket'); 

// Importação das rotas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const corridasRoutes = require('./routes/corridas');
const pagamentosRoutes = require('./routes/pagamentos');

const app = express();
const server = http.createServer(app);

// Middlewares essenciais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Servir o Painel Admin (Arquivos Estáticos)
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

// 2. Registro das Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/pagamentos', pagamentosRoutes);

// 3. Inicialização do WebSocket
initializeWebSocket(server);

// Rota de teste para verificar se o servidor está online
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'Servidor L\'europe Online', 
        timestamp: new Date(),
        node_version: process.version 
    });
});

// Definição da porta (Padrão 10000 para o Render ou 3002 local)
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR ATIVO NA PORTA: ${PORT}`);
    console.log(`PAINEL ADMIN: http://localhost:${PORT}/admin`);
    console.log(`=========================================`);
});