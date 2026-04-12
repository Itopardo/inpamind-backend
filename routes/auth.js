const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authMiddleware, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    if (await db.findUserByEmail(email)) return res.status(409).json({ error: 'El email ya está registrado' });

    const user = {
      id: uuidv4(), name: name.trim(), email: email.toLowerCase().trim(),
      password: bcrypt.hashSync(password, 10), role: 'vendedor', active: true,
      created_at: new Date().toISOString()
    };
    await db.createUser(user);
    const userData = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.status(201).json({ token: generateToken(userData), user: userData });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

    const user = await db.findUserByEmail(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    if (!user.active) return res.status(403).json({ error: 'Tu cuenta ha sido desactivada. Contacta al administrador.' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const userData = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ token: generateToken(userData), user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
});

module.exports = router;
