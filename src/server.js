const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

// WebSocket logic
const { initializeWebSocket } = require('./websocket');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const corridasRoutes = require('./routes/corridas');
const pagamentosRoutes = require('./routes/pagamentos');
const motoristasRoutes = require('./routes/motoristas');
const favoritosRoutes = require('./routes/favoritos');
const carrosRoutes = require('./routes/carros');
const stripeWebhookRoutes = require('./stripe-webhook');

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
// Stripe webhook needs raw body before express.json
app.use('/api/stripe', stripeWebhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/motoristas', motoristasRoutes);
app.use('/api/favoritos', favoritosRoutes);
app.use('/api/carros', carrosRoutes);

// WebSocket init
initializeWebSocket(server);

// Log DB host for debugging (no credentials)
try {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const parsed = new URL(dbUrl);
    console.log(`DB HOST: ${parsed.host} | DB NAME: ${parsed.pathname.replace('/', '')}`);
  } else {
    console.log('DB HOST: (DATABASE_URL ausente)');
  }
} catch (err) {
  console.log('DB HOST: (erro ao ler DATABASE_URL)');
}

// Status check
app.get('/api/status', (req, res) => {
  res.json({
    status: "Servidor L'europe Online",
    timestamp: new Date(),
    node_version: process.version
  });
});

// Port
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log('=========================================');
  console.log(`SERVIDOR ATIVO NA PORTA: ${PORT}`);
  console.log(`PAINEL ADMIN: http://localhost:${PORT}/admin`);
  console.log('=========================================');
});
