const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

// Load or initialize database
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) { console.error('DB load error:', e); }
  return { users: [], visits: [] };
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

let db = loadDB();

// Seed admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@inpamind.cl';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

if (!db.users.find(u => u.email === ADMIN_EMAIL)) {
  db.users.push({
    id: uuidv4(),
    name: 'Administrador',
    email: ADMIN_EMAIL,
    password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    role: 'admin',
    active: true,
    created_at: new Date().toISOString()
  });
  saveDB(db);
  console.log(`✅ Admin creado: ${ADMIN_EMAIL}`);
}

// DB API
const database = {
  // Users
  findUserByEmail(email) { return db.users.find(u => u.email === email.toLowerCase()); },
  findUserById(id) { return db.users.find(u => u.id === id); },
  createUser(user) { db.users.push(user); saveDB(db); return user; },
  getUsers(role) { return role ? db.users.filter(u => u.role === role) : db.users; },
  updateUser(id, updates) {
    const i = db.users.findIndex(u => u.id === id);
    if (i < 0) return null;
    db.users[i] = { ...db.users[i], ...updates };
    saveDB(db);
    return db.users[i];
  },

  // Visits
  createVisit(visit) { db.visits.push(visit); saveDB(db); return visit; },
  findVisitById(id) { return db.visits.find(v => v.id === id); },
  getVisitsByUser(userId, search) {
    let visits = db.visits.filter(v => v.user_id === userId);
    if (search) {
      const q = search.toLowerCase();
      visits = visits.filter(v =>
        (v.cliente || '').toLowerCase().includes(q) ||
        (v.direccion || '').toLowerCase().includes(q) ||
        (v.contacto || '').toLowerCase().includes(q) ||
        (v.descripcion || '').toLowerCase().includes(q)
      );
    }
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },
  getAllVisits(filters = {}) {
    let visits = [...db.visits];
    if (filters.seller) {
      const user = db.users.find(u => u.email === filters.seller || u.id === filters.seller);
      if (user) visits = visits.filter(v => v.user_id === user.id);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      visits = visits.filter(v => {
        const user = db.users.find(u => u.id === v.user_id);
        return (v.cliente || '').toLowerCase().includes(q) ||
          (v.direccion || '').toLowerCase().includes(q) ||
          (v.contacto || '').toLowerCase().includes(q) ||
          (v.descripcion || '').toLowerCase().includes(q) ||
          (user?.name || '').toLowerCase().includes(q);
      });
    }
    if (filters.from) visits = visits.filter(v => v.fecha >= filters.from);
    if (filters.to) visits = visits.filter(v => v.fecha <= filters.to);
    // Attach seller info
    visits = visits.map(v => {
      const user = db.users.find(u => u.id === v.user_id);
      return { ...v, seller_name: user?.name || '?', seller_email: user?.email || '?' };
    });
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },
  updateVisit(id, updates) {
    const i = db.visits.findIndex(v => v.id === id);
    if (i < 0) return null;
    db.visits[i] = { ...db.visits[i], ...updates, updated_at: new Date().toISOString() };
    saveDB(db);
    return db.visits[i];
  },
  deleteVisit(id) {
    const i = db.visits.findIndex(v => v.id === id);
    if (i < 0) return false;
    db.visits.splice(i, 1);
    saveDB(db);
    return true;
  },

  // Stats
  getStats() {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const sellers = db.users.filter(u => u.role === 'vendedor');
    const perSeller = sellers.map(s => ({
      name: s.name, email: s.email,
      visit_count: db.visits.filter(v => v.user_id === s.id).length
    })).sort((a, b) => b.visit_count - a.visit_count);
    return {
      totalVisits: db.visits.length,
      totalSellers: sellers.length,
      activeSellers: sellers.filter(s => s.active).length,
      monthVisits: db.visits.filter(v => v.fecha >= monthStart).length,
      withPhoto: db.visits.filter(v => v.foto_url).length,
      perSeller
    };
  },
  getSellers() {
    return db.users.filter(u => u.role === 'vendedor').map(u => ({
      id: u.id, name: u.name, email: u.email, active: u.active, created_at: u.created_at,
      visit_count: db.visits.filter(v => v.user_id === u.id).length
    }));
  }
};

module.exports = database;
