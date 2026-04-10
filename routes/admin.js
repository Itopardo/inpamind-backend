const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try { res.json(db.getStats()); }
  catch (err) { res.status(500).json({ error: 'Error al obtener estadísticas' }); }
});

// GET /api/admin/sellers
router.get('/sellers', (req, res) => {
  try { res.json({ sellers: db.getSellers() }); }
  catch (err) { res.status(500).json({ error: 'Error al obtener vendedores' }); }
});

// PUT /api/admin/sellers/:id — Toggle active
router.put('/sellers/:id', (req, res) => {
  try {
    const sellers = db.getSellers();
    const seller = sellers.find(s => s.id === req.params.id);
    if (!seller) return res.status(404).json({ error: 'Vendedor no encontrado' });
    const updated = db.updateUser(req.params.id, { active: !seller.active });
    res.json({ message: updated.active ? 'Vendedor activado' : 'Vendedor desactivado', active: updated.active });
  } catch (err) { res.status(500).json({ error: 'Error al actualizar vendedor' }); }
});

// GET /api/admin/visits
router.get('/visits', (req, res) => {
  try {
    const visits = db.getAllVisits({ seller: req.query.seller, search: req.query.search, from: req.query.from, to: req.query.to });
    res.json({ visits, total: visits.length });
  } catch (err) { res.status(500).json({ error: 'Error al obtener visitas' }); }
});

// PUT /api/admin/visits/:id
router.put('/visits/:id', (req, res) => {
  try {
    const { fecha, hora, cliente, direccion, contacto, descripcion } = req.body;
    const updated = db.updateVisit(req.params.id, { fecha, hora: hora || '', cliente: cliente?.trim(),
      direccion: direccion?.trim(), contacto: contacto?.trim() || '', descripcion: descripcion?.trim() || '' });
    if (!updated) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ visit: updated, message: '✓ Visita actualizada' });
  } catch (err) { res.status(500).json({ error: 'Error al actualizar visita' }); }
});

// DELETE /api/admin/visits/:id
router.delete('/visits/:id', (req, res) => {
  try {
    const visit = db.findVisitById(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visita no encontrada' });
    if (visit.foto_path) {
      const fp = path.join(__dirname, '..', 'uploads', visit.foto_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.deleteVisit(req.params.id);
    res.json({ message: '✓ Visita eliminada' });
  } catch (err) { res.status(500).json({ error: 'Error al eliminar visita' }); }
});

// GET /api/admin/export/csv
router.get('/export/csv', (req, res) => {
  try {
    const visits = db.getAllVisits({});
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
