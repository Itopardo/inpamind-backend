const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Conexión a MongoDB
async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.warn('⚠️ No se encontró MONGODB_URI en las variables de entorno. Usando base local (solo para desarrollo)');
      await mongoose.connect('mongodb://127.0.0.1:27017/inpamind', {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    } else {
      await mongoose.connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    }
    console.log('✅ Conectado a MongoDB');
    await seedAdmin();
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

// Modelos (Schemas)
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // Mantenemos uuid por retrocompatibilidad
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
  fecha: String,
  hora: String,
  hora_salida: String,
  cliente: String,
  direccion: String,
  contacto: String,
  cargo: String,
  telefono: String,
  mail: String,
  descripcion: String,
  foto_path: String,
  foto_url: String,
  foto_adicional_path: String,
  foto_adicional_url: String,
  created_at: String,
  updated_at: String
});

const User = mongoose.model('User', userSchema);
const Visit = mongoose.model('Visit', visitSchema);

async function seedAdmin() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@inpamind.cl';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  
  const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
  if (!existingAdmin) {
    const admin = new User({
      id: require('uuid').v4(),
      name: 'Administrador',
      email: ADMIN_EMAIL,
      password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
      role: 'admin',
      active: true,
      created_at: new Date().toISOString()
    });
    await admin.save();
    console.log(`✅ Admin credo: ${ADMIN_EMAIL}`);
  }
}

// Nueva API Asíncrona simulando la anterior lo más posible pero devolviendo promesas
const database = {
  connectDB,
  User,
  Visit,

  // Users
  async findUserByEmail(email) { return await User.findOne({ email: email.toLowerCase() }).lean(); },
  async findUserById(id) { return await User.findOne({ id }).lean(); },
  async createUser(userData) { const u = new User(userData); await u.save(); return u.toObject(); },
  async getUsers(role) { return role ? await User.find({ role }).lean() : await User.find().lean(); },
  async updateUser(id, updates) { 
    return await User.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean(); 
  },

  // Visits
  async createVisit(visitData) { const v = new Visit(visitData); await v.save(); return v.toObject(); },
  async findVisitById(id) { return await Visit.findOne({ id }).lean(); },
  
  async getVisitsByUser(userId, search) {
    let query = { user_id: userId };
    if (search) {
      const q = new RegExp(search, 'i');
      query.$or = [
        { cliente: q }, { direccion: q }, { contacto: q }, { descripcion: q }
      ];
    }
    const visits = await Visit.find(query).lean();
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },

  async getAllVisits(filters = {}) {
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
      query.$or = [
        { cliente: q }, { direccion: q }, { contacto: q }, { descripcion: q }
      ];
    }
    
    let visits = await Visit.find(query).lean();
    
    // Attach seller info
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
        (v.cliente || '').toLowerCase().includes(q) ||
        (v.direccion || '').toLowerCase().includes(q) ||
        (v.contacto || '').toLowerCase().includes(q) ||
        (v.descripcion || '').toLowerCase().includes(q) ||
        (v.seller_name || '').toLowerCase().includes(q)
      );
    }
    
    return visits.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },

  async updateVisit(id, updates) {
    updates.updated_at = new Date().toISOString();
    return await Visit.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  },
  
  async deleteVisit(id) {
    const res = await Visit.deleteOne({ id });
    return res.deletedCount > 0;
  },

  // Stats
  async getStats() {
    const visits = await Visit.find().lean();
    const sellers = await User.find({ role: 'vendedor' }).lean();
    
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    
    const perSeller = sellers.map(s => ({
      name: s.name, email: s.email,
      visit_count: visits.filter(v => v.user_id === s.id).length
    })).sort((a, b) => b.visit_count - a.visit_count);
    
    return {
      totalVisits: visits.length,
      totalSellers: sellers.length,
      activeSellers: sellers.filter(s => s.active).length,
      monthVisits: visits.filter(v => v.fecha >= monthStart).length,
      withPhoto: visits.filter(v => v.foto_url).length,
      perSeller
    };
  },
  
  async getSellers() {
    const sellers = await User.find({ role: 'vendedor' }).lean();
    const visits = await Visit.find().lean();
    
    return sellers.map(u => ({
      id: u.id, name: u.name, email: u.email, active: u.active, created_at: u.created_at,
      visit_count: visits.filter(v => v.user_id === u.id).length
    }));
  }
};

module.exports = database;
