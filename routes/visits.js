const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configurar Cloudinary con variables de entorno (Render)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dziicih4l',
  api_key: process.env.CLOUDINARY_API_KEY || '399248129199696',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'wBhmJLljHuRR8FMXSM_H3D-yzfo'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'inpamind_visits',
    resource_type: 'image',
    format: 'jpg'
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });
const _uploadFields = upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'foto_adicional', maxCount: 1 }
]);

// Wrapper para capturar errores de multer/Cloudinary y devolver JSON
function uploadFields(req, res, next) {
  _uploadFields(req, res, (err) => {
    if (err) {
      console.error('Upload middleware error:', err.message, err.stack);
      return res.status(500).json({ error: 'Error al subir la foto: ' + err.message });
    }
    next();
  });
}

// POST /api/visits
router.post('/', authMiddleware, uploadFields, async (req, res) => {
  try {
    const { fecha, hora, hora_salida, cliente, direccion, contacto, cargo, telefono, mail, descripcion } = req.body;
    if (!cliente || !direccion) return res.status(400).json({ error: 'Cliente y dirección son requeridos' });

    let fotoPath = null, fotoUrl = null;
    let fotoAdicionalPath = null, fotoAdicionalUrl = null;

    const fotoFile = req.files?.['foto']?.[0];
    const fotoAdicionalFile = req.files?.['foto_adicional']?.[0];

    if (fotoFile) { fotoPath = fotoFile.filename; fotoUrl = fotoFile.path; }
    if (fotoAdicionalFile) { fotoAdicionalPath = fotoAdicionalFile.filename; fotoAdicionalUrl = fotoAdicionalFile.path; }

    const now = new Date().toISOString();
    const visit = await db.createVisit({
      id: uuidv4(), user_id: req.user.id, fecha: fecha || now.split('T')[0], hora: hora || '',
      hora_salida: hora_salida || '',
      cliente: cliente.trim(), direccion: direccion.trim(),
      contacto: contacto?.trim() || '', cargo: cargo?.trim() || '',
      telefono: telefono?.trim() || '', mail: mail?.trim() || '',
      descripcion: descripcion?.trim() || '',
      foto_path: fotoPath, foto_url: fotoUrl,
      foto_adicional_path: fotoAdicionalPath, foto_adicional_url: fotoAdicionalUrl,
      created_at: now, updated_at: now
    });
    res.status(201).json({ visit, message: '✓ Visita guardada correctamente' });
  } catch (err) { console.error('Create visit error:', err.message, err.stack); res.status(500).json({ error: 'Error al guardar la visita: ' + err.message }); }
});

// GET /api/visits
router.get('/', authMiddleware, async (req, res) => {
  try {
    const visits = await db.getVisitsByUser(req.user.id, req.query.search);
    res.json({ visits, total: visits.length });
  } catch (err) { res.status(500).json({ error: 'Error al obtener visitas' }); }
});

// GET /api/visits/stats/me — Personal stats for vendedor dashboard
router.get('/stats/me', authMiddleware, async (req, res) => {
  try {
    const allVisits = await db.getVisitsByUser(req.user.id);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const todayVisits = allVisits.filter(v => v.fecha === today).length;
    const monthVisits = allVisits.filter(v => v.fecha >= monthStart).length;
    const weekVisits = allVisits.filter(v => v.fecha >= weekAgo).length;
    const uniqueClients = new Set(allVisits.map(v => v.cliente?.toLowerCase())).size;
    const withPhoto = allVisits.filter(v => v.foto_url).length;

    // Visits per day for last 7 days (for chart)
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' });
      dailyData.push({ date: dateStr, label: dayName, count: allVisits.filter(v => v.fecha === dateStr).length });
    }

    // Visits per month for last 6 months (for chart)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mEndStr = `${mEnd.getFullYear()}-${String(mEnd.getMonth() + 1).padStart(2, '0')}-${String(mEnd.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CL', { month: 'short' });
      monthlyData.push({ label, count: allVisits.filter(v => v.fecha >= mStart && v.fecha <= mEndStr).length });
    }

    res.json({
      total: allVisits.length, todayVisits, monthVisits, weekVisits,
      uniqueClients, withPhoto, dailyData, monthlyData
    });
  } catch (err) { console.error('Stats error:', err); res.status(500).json({ error: 'Error al obtener estadísticas' }); }
});

// GET /api/visits/export/csv
router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const visits = await db.getVisitsByUser(req.user.id);
    let csv = '\uFEFFID,Fecha,Hora,Cliente,Dirección,Contacto,Descripción,Tiene Foto,Fecha Creación\n';
    visits.forEach(v => {
      csv += [v.id.substr(0, 8), v.fecha, v.hora || '', `"${(v.cliente || '').replace(/"/g, '""')}"`,
        `"${(v.direccion || '').replace(/"/g, '""')}"`, `"${(v.contacto || '').replace(/"/g, '""')}"`,
        `"${(v.descripcion || '').replace(/"/g, '""')}"`, v.foto_url ? 'Sí' : 'No', v.created_at
      ].join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=visitas_inpamind.csv');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Error al exportar CSV' }); }
});

// GET /api/visits/:id
router.get('/:id', authMiddleware, async (req, res) => {
  const visit = await db.findVisitById(req.params.id);
  if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });
  res.json({ visit });
});

// PUT /api/visits/:id
router.put('/:id', authMiddleware, uploadFields, async (req, res) => {
  try {
    const visit = await db.findVisitById(req.params.id);
    if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });

    const { fecha, hora, hora_salida, cliente, direccion, contacto, cargo, telefono, mail, descripcion, remove_photo, remove_foto_adicional } = req.body;
    if (!cliente || !direccion) return res.status(400).json({ error: 'Cliente y dirección son requeridos' });

    const fotoFile = req.files?.['foto']?.[0];
    const fotoAdicionalFile = req.files?.['foto_adicional']?.[0];

    let fotoPath = visit.foto_path, fotoUrl = visit.foto_url;
    if (remove_photo === 'true') {
      if (visit.foto_path) await cloudinary.uploader.destroy(visit.foto_path).catch(() => {});
      fotoPath = null; fotoUrl = null;
    } else if (fotoFile) {
      if (visit.foto_path) await cloudinary.uploader.destroy(visit.foto_path).catch(() => {});
      fotoPath = fotoFile.filename; fotoUrl = fotoFile.path;
    }

    let fotoAdicionalPath = visit.foto_adicional_path, fotoAdicionalUrl = visit.foto_adicional_url;
    if (remove_foto_adicional === 'true') {
      if (visit.foto_adicional_path) await cloudinary.uploader.destroy(visit.foto_adicional_path).catch(() => {});
      fotoAdicionalPath = null; fotoAdicionalUrl = null;
    } else if (fotoAdicionalFile) {
      if (visit.foto_adicional_path) await cloudinary.uploader.destroy(visit.foto_adicional_path).catch(() => {});
      fotoAdicionalPath = fotoAdicionalFile.filename; fotoAdicionalUrl = fotoAdicionalFile.path;
    }

    const updated = await db.updateVisit(req.params.id, {
      fecha, hora: hora || '', hora_salida: hora_salida || '',
      cliente: cliente.trim(), direccion: direccion.trim(),
      contacto: contacto?.trim() || '', cargo: cargo?.trim() || '',
      telefono: telefono?.trim() || '', mail: mail?.trim() || '',
      descripcion: descripcion?.trim() || '',
      foto_path: fotoPath, foto_url: fotoUrl,
      foto_adicional_path: fotoAdicionalPath, foto_adicional_url: fotoAdicionalUrl
    });
    res.json({ visit: updated, message: '✓ Visita actualizada' });
  } catch (err) { console.error('Update error:', err); res.status(500).json({ error: 'Error al actualizar la visita' }); }
});

// DELETE /api/visits/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const visit = await db.findVisitById(req.params.id);
  if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });
  if (visit.foto_path && visit.foto_path.includes('inpamind_visits')) await cloudinary.uploader.destroy(visit.foto_path);
  if (visit.foto_adicional_path && visit.foto_adicional_path.includes('inpamind_visits')) await cloudinary.uploader.destroy(visit.foto_adicional_path);
  await db.deleteVisit(req.params.id);
  res.json({ message: '✓ Visita eliminada' });
});

module.exports = router;
