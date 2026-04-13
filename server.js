const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();
const db = require('./database'); 

// Connect to MongoDB
db.connectDB();

const authRoutes = require('./routes/auth');
const visitRoutes = require('./routes/visits');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend (PWA)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'INPAMIND', version: '1.0.0' });
});
app.get('/api/health2', (req, res) => {
  res.json({ status: 'superok', db: !!process.env.MONGODB_URI });
});

// SPA fallback — serve index.html for unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║   INPAMIND — Sistema de Gestión de Visitas        ║
║   Servidor corriendo en http://localhost:${PORT}      ║
║   Admin: admin@inpamind.cl / admin123             ║
╚═══════════════════════════════════════════════════╝
  `);
});
