const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// ── Modo de base de datos ──
let useJsonDB = false;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// ── JSON DB helpers ──
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], visits: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return { users: [], visits: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Conexión a MongoDB ──
async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;
  if (mongoURI) {
    try {
      await mongoose.connect(mongoURI);
      console.log('✅ Conectado a MongoDB Atlas');
      await seedAdminMongo();
      return;
    } catch (err) {
      console.warn('⚠️  MongoDB Atlas no disponible:', err.message);
      console.log('📁 Usando base de datos local (JSON)...');
    }
  }
  // Fallback: JSON local
  useJsonDB = true;
  console.log('📁 Modo desarrollo: base de datos local (data/db.json)');
  await seedAdminJson();
}

// ── Modelos Mongoose ──
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: 'vendedor', enum: ['admin', 'vendedor'] },
  active: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() }
});

const visitSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  fecha: String, hora: String, hora_salida: String,
  cliente: String, direccion: String, contacto: String,
  cargo: String, telefono: String, mail: String,
  descripcion: String, foto_path: String, foto_url: String,
  foto_adicional_path: String, foto_adicional_url: String,
  created_at: String, updated_at: String
});

const User = mongoose.model('User', userSchema);
const Visit = mongoose.model('Visit', visitSchema);

// ── Seed Admin ──
async function seedAdminMongo() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@inpamind.cl';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (!existing) {
    const admin = new User({
      id: require('uuid').v4(), name: 'Administrador',
      email: ADMIN_EMAIL, password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      role: 'admin', active: true, created_at: new Date().toISOString()
    });
    await admin.save();
    console.log(`✅ Admin creado: ${ADMIN_EMAIL}`);
  }
}

async function seedAdminJson() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@inpamind.cl';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  const db = readDB();
  if (!db.users.find(u => u.email === ADMIN_EMAIL)) {
    db.users.push({
      id: require('uuid').v4(), name: 'Administrador',
      email: ADMIN_EMAIL, password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      role: 'admin', active: true, created_at: new Date().toISOString()
    });
    writeDB(db);
    console.log(`✅ Admin creado: ${ADMIN_EMAIL}`);
  }
}

// ── API de base de datos ──
const database = {
  connectDB, User, Visit,

  async findUserByEmail(email) {
    if (useJsonDB) {
      return readDB().users.find(u => u.email === email.toLowerCase()) || null;
    }
    return await User.findOne({ email: email.toLowerCase() }).lean();
  },

  async findUserById(id) {
    if (useJsonDB) return readDB().users.find(u => u.id === id) || null;
    return await User.findOne({ id }).lean();
  },

  async createUser(userData) {
    if (useJsonDB) {
      const db = readDB();
      db.users.push(userData);
      writeDB(db);
      return userData;
    }
    const u = new User(userData); await u.save(); return u.toObject();
  },

  async getUsers(role) {
    if (useJsonDB) {
      const db = readDB();
      return role ? db.users.filter(u => u.role === role) : db.users;
    }
    return role ? await User.find({ role }).lean() : await User.find().lean();
  },

  async updateUser(id, updates) {
    if (useJsonDB) {
      const db = readDB();
      const idx = db.users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      db.users[idx] = { ...db.users[idx], ...updates };
      writeDB(db);
      return db.users[idx];
    }
    return await User.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  },

  async createVisit(visitData) {
    if (useJsonDB) {
      const db = readDB();
      db.visits.push(visitData);
      writeDB(db);
      return visitData;
    }
    const v = new Visit(visitData); await v.save(); return v.toObject();
  },

  async findVisitById(id) {
    if (useJsonDB) return readDB().visits.find(v => v.id === id) || null;
    return await Visit.findOne({ id }).lean();
  },

  async getVisitsByUser(userId, search) {
    if (useJsonDB) {
      let visits = readDB().visits.filter(v => v.user_id === userId);
      if (search) {
        const q = search.toLowerCase();
        visits = visits.filter(v =>
          (v.cliente||'').toLowerCase().includes(q) ||
          (v.direccion||'').toLowerCase().includes(q) ||
          (v.contacto||'').toLowerCase().includes(q) ||
          (v.descripcion||'').toLowerCase().includes(q)
        );
      }
      return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
    }
    let query = { user_id: userId };
    if (search) {
      const q = new RegExp(search, 'i');
      query.$or = [{ cliente: q }, { direccion: q }, { contacto: q }, { descripcion: q }];
    }
    const visits = await Visit.find(query).lean();
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },

  async getAllVisits(filters = {}) {
    if (useJsonDB) {
      const db = readDB();
      let visits = [...db.visits];
      if (filters.seller) {
        const user = db.users.find(u => u.email === filters.seller || u.id === filters.seller);
        if (user) visits = visits.filter(v => v.user_id === user.id);
      }
      if (filters.from) visits = visits.filter(v => v.fecha >= filters.from);
      if (filters.to) visits = visits.filter(v => v.fecha <= filters.to);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        visits = visits.filter(v =>
          (v.cliente||'').toLowerCase().includes(q) ||
          (v.direccion||'').toLowerCase().includes(q) ||
          (v.contacto||'').toLowerCase().includes(q) ||
          (v.descripcion||'').toLowerCase().includes(q)
        );
      }
      const userMap = {};
      db.users.forEach(u => userMap[u.id] = u);
      visits = visits.map(v => ({
        ...v,
        seller_name: userMap[v.user_id]?.name || '?',
        seller_email: userMap[v.user_id]?.email || '?'
      }));
      return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
    }

    let query = {};
    if (filters.seller) {
      const user = await User.findOne({ $or: [{ email: filters.seller }, { id: filters.seller }] });
      if (user) query.user_id = user.id;
    }
    if (filters.from || filters.to) {
      query.fecha = {};
      if (filters.from) query.fecha.$gte = filters.from;
      if (filters.to) query.fecha.$lte = filters.to;
    }
    if (filters.search) {
      const q = new RegExp(filters.search, 'i');
      query.$or = [{ cliente: q }, { direccion: q }, { contacto: q }, { descripcion: q }];
    }
    let visits = await Visit.find(query).lean();
    const userIds = [...new Set(visits.map(v => v.user_id))];
    const users = await User.find({ id: { $in: userIds } }).lean();
    const userMap = {};
    users.forEach(u => userMap[u.id] = u);
    visits = visits.map(v => ({
      ...v,
      seller_name: userMap[v.user_id]?.name || '?',
      seller_email: userMap[v.user_id]?.email || '?'
    }));
    if (filters.search) {
      const q = filters.search.toLowerCase();
      visits = visits.filter(v =>
        (v.cliente||'').toLowerCase().includes(q) ||
        (v.direccion||'').toLowerCase().includes(q) ||
        (v.contacto||'').toLowerCase().includes(q) ||
        (v.descripcion||'').toLowerCase().includes(q) ||
        (v.seller_name||'').toLowerCase().includes(q)
      );
    }
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },

  async updateVisit(id, updates) {
    if (useJsonDB) {
      const db = readDB();
      const idx = db.visits.findIndex(v => v.id === id);
      if (idx === -1) return null;
      db.visits[idx] = { ...db.visits[idx], ...updates, updated_at: new Date().toISOString() };
      writeDB(db);
      return db.visits[idx];
    }
    updates.updated_at = new Date().toISOString();
    return await Visit.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  },

  async deleteVisit(id) {
    if (useJsonDB) {
      const db = readDB();
      const before = db.visits.length;
      db.visits = db.visits.filter(v => v.id !== id);
      writeDB(db);
      return db.visits.length < before;
    }
    const res = await Visit.deleteOne({ id });
    return res.deletedCount > 0;
  },

  async getStats() {
    if (useJsonDB) {
      const db = readDB();
      const visits = db.visits;
      const sellers = db.users.filter(u => u.role === 'vendedor');
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const perSeller = sellers.map(s => ({
        name: s.name, email: s.email,
        visit_count: visits.filter(v => v.user_id === s.id).length
      })).sort((a, b) => b.visit_count - a.visit_count);
      return {
        totalVisits: visits.length, totalSellers: sellers.length,
        activeSellers: sellers.filter(s => s.active).length,
        monthVisits: visits.filter(v => v.fecha >= monthStart).length,
        withPhoto: visits.filter(v => v.foto_url).length, perSeller
      };
    }
    const visits = await Visit.find().lean();
    const sellers = await User.find({ role: 'vendedor' }).lean();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const perSeller = sellers.map(s => ({
      name: s.name, email: s.email,
      visit_count: visits.filter(v => v.user_id === s.id).length
    })).sort((a, b) => b.visit_count - a.visit_count);
    return {
      totalVisits: visits.length, totalSellers: sellers.length,
      activeSellers: sellers.filter(s => s.active).length,
      monthVisits: visits.filter(v => v.fecha >= monthStart).length,
      withPhoto: visits.filter(v => v.foto_url).length, perSeller
    };
  },

  async getSellers() {
    if (useJsonDB) {
      const db = readDB();
      const visits = db.visits;
      return db.users
        .filter(u => u.role === 'vendedor')
        .map(u => ({
          id: u.id, name: u.name, email: u.email,
          active: u.active, created_at: u.created_at,
          visit_count: visits.filter(v => v.user_id === u.id).length
        }));
    }
    const sellers = await User.find({ role: 'vendedor' }).lean();
    const visits = await Visit.find().lean();
    return sellers.map(u => ({
      id: u.id, name: u.name, email: u.email, active: u.active, created_at: u.created_at,
      visit_count: visits.filter(v => v.user_id === u.id).length
    }));
  }
};

module.exports = database;
