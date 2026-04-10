const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => { const dir = path.join(__dirname, '..', 'uploads'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 8)}${path.extname(file.originalname) || '.jpg'}`); }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => { cb(null, file.mimetype.startsWith('image/')); } });

function saveBase64Photo(base64) {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}.jpg`;
  fs.writeFileSync(path.join(__dirname, '..', 'uploads', filename), Buffer.from(data, 'base64'));
  return filename;
}

function deletePhoto(fotoPath) {
  if (!fotoPath) return;
  const fp = path.join(__dirname, '..', 'uploads', fotoPath);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

// POST /api/visits
router.post('/', authMiddleware, upload.single('foto'), (req, res) => {
  try {
    const { fecha, hora, cliente, direccion, contacto, descripcion } = req.body;
    if (!cliente || !direccion) return res.status(400).json({ error: 'Cliente y dirección son requeridos' });

    let fotoPath = null, fotoUrl = null;
    if (req.file) { fotoPath = req.file.filename; fotoUrl = `/uploads/${req.file.filename}`; }
    else if (req.body.foto_base64) { fotoPath = saveBase64Photo(req.body.foto_base64); fotoUrl = `/uploads/${fotoPath}`; }

    const now = new Date().toISOString();
    const visit = db.createVisit({
      id: uuidv4(), user_id: req.user.id, fecha: fecha || now.split('T')[0], hora: hora || '',
      cliente: cliente.trim(), direccion: direccion.trim(), contacto: contacto?.trim() || '',
      descripcion: descripcion?.trim() || '', foto_path: fotoPath, foto_url: fotoUrl,
      created_at: now, updated_at: now
    });
    res.status(201).json({ visit, message: '✓ Visita guardada correctamente' });
  } catch (err) { console.error('Create visit error:', err); res.status(500).json({ error: 'Error al guardar la visita' }); }
});

// GET /api/visits
router.get('/', authMiddleware, (req, res) => {
  try {
    const visits = db.getVisitsByUser(req.user.id, req.query.search);
    res.json({ visits, total: visits.length });
  } catch (err) { res.status(500).json({ error: 'Error al obtener visitas' }); }
});

// GET /api/visits/export/csv
router.get('/export/csv', authMiddleware, (req, res) => {
  try {
    const visits = db.getVisitsByUser(req.user.id);
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
router.get('/:id', authMiddleware, (req, res) => {
  const visit = db.findVisitById(req.params.id);
  if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });
  res.json({ visit });
});

// PUT /api/visits/:id
router.put('/:id', authMiddleware, upload.single('foto'), (req, res) => {
  try {
    const visit = db.findVisitById(req.params.id);
    if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });

    const { fecha, hora, cliente, direccion, contacto, descripcion, remove_photo } = req.body;
    if (!cliente || !direccion) return res.status(400).json({ error: 'Cliente y dirección son requeridos' });

    let fotoPath = visit.foto_path, fotoUrl = visit.foto_url;
    if (remove_photo === 'true') { deletePhoto(visit.foto_path); fotoPath = null; fotoUrl = null; }
    if (req.file) { deletePhoto(visit.foto_path); fotoPath = req.file.filename; fotoUrl = `/uploads/${req.file.filename}`; }
    else if (req.body.foto_base64) { deletePhoto(visit.foto_path); fotoPath = saveBase64Photo(req.body.foto_base64); fotoUrl = `/uploads/${fotoPath}`; }

    const updated = db.updateVisit(req.params.id, { fecha, hora: hora || '', cliente: cliente.trim(),
      direccion: direccion.trim(), contacto: contacto?.trim() || '', descripcion: descripcion?.trim() || '',
      foto_path: fotoPath, foto_url: fotoUrl });
    res.json({ visit: updated, message: '✓ Visita actualizada' });
  } catch (err) { console.error('Update error:', err); res.status(500).json({ error: 'Error al actualizar la visita' }); }
});

// DELETE /api/visits/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const visit = db.findVisitById(req.params.id);
  if (!visit || visit.user_id !== req.user.id) return res.status(404).json({ error: 'Visita no encontrada' });
  deletePhoto(visit.foto_path);
  db.deleteVisit(req.params.id);
  res.json({ message: '✓ Visita eliminada' });
});

module.exports = router;
