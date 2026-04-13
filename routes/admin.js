const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    const now = new Date();

    // Daily data for last 7 days
    const allVisits = await db.getAllVisits({});
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' });
      dailyData.push({ date: dateStr, label: dayName, count: allVisits.filter(v => v.fecha === dateStr).length });
    }

    // Monthly data for last 6 months
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mEndStr = `${mEnd.getFullYear()}-${String(mEnd.getMonth() + 1).padStart(2, '0')}-${String(mEnd.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CL', { month: 'short' });
      monthlyData.push({ label, count: allVisits.filter(v => v.fecha >= mStart && v.fecha <= mEndStr).length });
    }

    res.json({ ...stats, dailyData, monthlyData });
  }
  catch (err) { res.status(500).json({ error: 'Error al obtener estadísticas' }); }
});

// GET /api/admin/sellers
router.get('/sellers', async (req, res) => {
  try { res.json({ sellers: await db.getSellers() }); }
  catch (err) { res.status(500).json({ error: 'Error al obtener vendedores' }); }
});

// POST /api/admin/users — Crear nuevo usuario (solo admin)
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    if (role && !['vendedor', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

    if (await db.findUserByEmail(email)) return res.status(409).json({ error: 'El email ya está registrado' });

    const user = {
      id: uuidv4(), name: name.trim(), email: email.toLowerCase().trim(),
      password: bcrypt.hashSync(password, 10), role: role || 'vendedor', active: true,
      created_at: new Date().toISOString()
    };
    await db.createUser(user);
    res.status(201).json({ message: `✓ Usuario "${user.name}" creado correctamente`, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/admin/sellers/:id — Toggle active
router.put('/sellers/:id', async (req, res) => {
  try {
    const sellers = await db.getSellers();
    const seller = sellers.find(s => s.id === req.params.id);
    if (!seller) return res.status(404).json({ error: 'Vendedor no encontrado' });
    const updated = await db.updateUser(req.params.id, { active: !seller.active });
    res.json({ message: updated.active ? 'Vendedor activado' : 'Vendedor desactivado', active: updated.active });
  } catch (err) { res.status(500).json({ error: 'Error al actualizar vendedor' }); }
});

// GET /api/admin/visits
router.get('/visits', async (req, res) => {
  try {
    const visits = await db.getAllVisits({ seller: req.query.seller, search: req.query.search, from: req.query.from, to: req.query.to });
    res.json({ visits, total: visits.length });
  } catch (err) { res.status(500).json({ error: 'Error al obtener visitas' }); }
});

// PUT /api/admin/visits/:id
router.put('/visits/:id', async (req, res) => {
  try {
    const { fecha, hora, cliente, direccion, contacto, descripcion } = req.body;
    const updated = await db.updateVisit(req.params.id, { fecha, hora: hora || '', cliente: cliente?.trim(),
      direccion: direccion?.trim(), contacto: contacto?.trim() || '', descripcion: descripcion?.trim() || '' });
    if (!updated) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ visit: updated, message: '✓ Visita actualizada' });
  } catch (err) { res.status(500).json({ error: 'Error al actualizar visita' }); }
});

// DELETE /api/admin/visits/:id
router.delete('/visits/:id', async (req, res) => {
  try {
    const visit = await db.findVisitById(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });
    if (visit.foto_path) {
      const fp = path.join(__dirname, '..', 'uploads', visit.foto_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.deleteVisit(req.params.id);
    res.json({ message: '✓ Visita eliminada' });
  } catch (err) { res.status(500).json({ error: 'Error al eliminar visita' }); }
});

// GET /api/admin/export/csv
router.get('/export/csv', async (req, res) => {
  try {
    const visits = await db.getAllVisits({});
    let csv = '\uFEFFID,Vendedor,Email,Fecha,Hora,Cliente,Dirección,Contacto,Descripción,Foto,Creación\n';
    visits.forEach(v => {
      csv += [v.id.substr(0, 8), `"${v.seller_name}"`, v.seller_email, v.fecha, v.hora || '',
        `"${(v.cliente || '').replace(/"/g, '""')}"`, `"${(v.direccion || '').replace(/"/g, '""')}"`,
        `"${(v.contacto || '').replace(/"/g, '""')}"`, `"${(v.descripcion || '').replace(/"/g, '""')}"`,
        v.foto_url ? 'Sí' : 'No', v.created_at].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=inpamind_todas_visitas.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Error al exportar CSV' }); }
});

module.exports = router;
