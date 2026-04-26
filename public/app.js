// ── INPAMIND App — Frontend Logic v2 ──
const API = window.location.origin;
let token = localStorage.getItem('inpamind_token');
let currentUser = null;
let currentVisitId = null;
let newPhotoData = null;
let editPhotoData = null;
let editPhotoChanged = false;
let navHistory = [];
let vendedorChart = null;
let adminDailyChart = null;
let adminMonthlyChart = null;
let adminSellerChart = null;

// ── Chart.js Global Config ──
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = 'rgba(255,255,255,.5)';
  Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 11;
}

// ── API Helper ──
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

// ── Screen Navigation ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    // Re-trigger animation
    el.style.animation = 'none';
    el.offsetHeight; // force reflow
    el.style.animation = '';
  }
}
function goBack() {
  if (navHistory.length > 0) showScreen(navHistory.pop());
  else if (currentUser?.role === 'admin') switchTab(3);
  else switchTab(3);
}

// ── Auth ──
async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  if (!email || !pass) return toast('Completa todos los campos', 'err');
  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password: pass } });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('inpamind_token', token);
    enterApp();
    toast('¡Bienvenido, ' + currentUser.name + '!', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
}

// ── Crear Usuario (solo admin) ──
function openCreateUser() {
  const modal = document.getElementById('createUserModal');
  modal.style.display = 'flex';
  document.getElementById('cu-name').value = '';
  document.getElementById('cu-email').value = '';
  document.getElementById('cu-pass').value = '';
  document.getElementById('cu-role').value = 'vendedor';
  setTimeout(() => document.getElementById('cu-name').focus(), 100);
}

function closeCreateUser() {
  document.getElementById('createUserModal').style.display = 'none';
}

async function submitCreateUser() {
  const name = document.getElementById('cu-name').value.trim();
  const email = document.getElementById('cu-email').value.trim();
  const pass = document.getElementById('cu-pass').value;
  const role = document.getElementById('cu-role').value;
  if (!name || !email || !pass) return toast('Completa todos los campos', 'err');
  if (pass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'err');
  const btn = document.getElementById('btnCreateUser');
  btn.disabled = true;
  try {
    const data = await api('/api/admin/users', { method: 'POST', body: { name, email, password: pass, role } });
    toast(data.message, 'ok');
    closeCreateUser();
    loadAdminStats();
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
}

function doLogout() {
  if (!confirm('¿Estás seguro que deseas salir?')) return;
  token = null;
  currentUser = null;
  localStorage.removeItem('inpamind_token');
  showScreen('s-login');
}

function enterApp() {
  document.getElementById('welcomeName').textContent = currentUser.name;
  document.getElementById('footerName').textContent = currentUser.name;
  // Set avatar initials
  const initials = currentUser.name.split(' ').map(w => w[0]).join('').substring(0, 2);
  document.getElementById('homeAvatar').textContent = initials;
  // Admin avatar amber
  if (currentUser.role === 'admin') {
    document.getElementById('homeAvatar').style.background = 'linear-gradient(135deg, #E8A020, #F0C060)';
  }
  initTabs();
  initNewForm();
  renderHomeDashboard();
  if (currentUser.role === 'admin') {
    switchTab(0);
  } else {
    switchTab(0);
  }
}

// ── Home Dashboard ──
function renderHomeDashboard() {
  const container = document.getElementById('home-dashboard');
  if (currentUser.role === 'admin') {
    container.innerHTML = `
      <div class="stat-grid" style="margin:0 0 14px">
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Total Visitas</div></div>
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Vendedores Activos</div></div>
        <div class="stat-card amber shimmer"><div class="stat-num">—</div><div class="stat-lbl">Visitas del Mes</div></div>
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Con Foto</div></div>
      </div>
      <div class="card" style="margin-bottom:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <ion-icon name="trending-up" style="font-size:16px;color:var(--cyan)"></ion-icon>
          <span style="font-size:13px;font-weight:700;letter-spacing:.5px">Visitas Últimos 7 Días</span>
        </div>
        <div style="height:170px;position:relative"><canvas id="homeDailyChart"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <ion-icon name="stats-chart" style="font-size:16px;color:var(--amber)"></ion-icon>
          <span style="font-size:13px;font-weight:700;letter-spacing:.5px">Tendencia Mensual</span>
        </div>
        <div style="height:170px;position:relative"><canvas id="homeMonthlyChart"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:12px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <ion-icon name="people" style="font-size:16px;color:var(--cyan)"></ion-icon>
          <span style="font-size:13px;font-weight:700;letter-spacing:.5px">Visitas por Vendedor</span>
        </div>
        <div style="height:200px;position:relative"><canvas id="homeSellerChart"></canvas></div>
      </div>
      <button class="btn-glass" onclick="switchTab(1)" style="margin-bottom:0"><ion-icon name="list-outline" style="font-size:20px"></ion-icon>VER HISTORIAL COMPLETO</button>
    `;
    loadAdminHomeDashboard();
  } else {
    container.innerHTML = `
      <div class="stat-grid" style="margin:0 0 14px">
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Hoy</div></div>
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Este Mes</div></div>
        <div class="stat-card amber shimmer"><div class="stat-num">—</div><div class="stat-lbl">Total</div></div>
        <div class="stat-card shimmer"><div class="stat-num">—</div><div class="stat-lbl">Clientes</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <ion-icon name="bar-chart" style="font-size:16px;color:var(--cyan)"></ion-icon>
          <span style="font-size:13px;font-weight:700;letter-spacing:.5px">Actividad Semanal</span>
        </div>
        <div style="height:160px;position:relative"><canvas id="vendedorChart"></canvas></div>
      </div>
      <button class="btn-cyan" style="margin-bottom:12px" onclick="switchTab(1)"><ion-icon name="add-circle-outline" style="font-size:22px"></ion-icon>NUEVA VISITA</button>
      <button class="btn-glass" onclick="switchTab(3)"><ion-icon name="time-outline" style="font-size:20px"></ion-icon>HISTORIAL DE VISITAS</button>
    `;
    loadVendedorStats();
  }
}

// ── Admin Home Dashboard ──
let homeDailyChart = null, homeMonthlyChart = null, homeSellerChart = null;

async function loadAdminHomeDashboard() {
  try {
    const data = await api('/api/admin/stats');

    // Update stat cards
    const statCards = document.querySelectorAll('#home-dashboard .stat-card');
    if (statCards.length >= 4) {
      statCards[0].innerHTML = `<div class="stat-num">${data.totalVisits}</div><div class="stat-lbl">Total Visitas</div>`;
      statCards[0].classList.remove('shimmer');
      statCards[1].innerHTML = `<div class="stat-num">${data.activeSellers}</div><div class="stat-lbl">Vendedores Activos</div>`;
      statCards[1].classList.remove('shimmer');
      statCards[2].innerHTML = `<div class="stat-num">${data.monthVisits}</div><div class="stat-lbl">Visitas del Mes</div>`;
      statCards[2].classList.remove('shimmer');
      statCards[3].innerHTML = `<div class="stat-num">${data.withPhoto}</div><div class="stat-lbl">Con Foto</div>`;
      statCards[3].classList.remove('shimmer');
    }

    // Daily chart
    const dailyCtx = document.getElementById('homeDailyChart');
    if (dailyCtx && data.dailyData) {
      if (homeDailyChart) homeDailyChart.destroy();
      const gradient = dailyCtx.getContext('2d').createLinearGradient(0, 0, 0, 170);
      gradient.addColorStop(0, 'rgba(65,198,246,.4)');
      gradient.addColorStop(1, 'rgba(65,198,246,.02)');
      homeDailyChart = new Chart(dailyCtx, {
        type: 'line',
        data: { labels: data.dailyData.map(d => d.label), datasets: [{ data: data.dailyData.map(d => d.count), borderColor: '#41C6F6', borderWidth: 2.5, backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#41C6F6', pointBorderColor: '#0C1A3A', pointBorderWidth: 2, pointHoverRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(12,26,58,.95)', titleColor: '#fff', bodyColor: '#41C6F6', borderColor: 'rgba(65,198,246,.3)', borderWidth: 1, cornerRadius: 10, padding: 10, callbacks: { label: (ctx) => `${ctx.raw} visita${ctx.raw !== 1 ? 's' : ''}` } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(255,255,255,.04)' } }, x: { grid: { display: false } } }, animation: { duration: 1000, easing: 'easeOutQuart' } }
      });
    }

    // Monthly chart
    const monthlyCtx = document.getElementById('homeMonthlyChart');
    if (monthlyCtx && data.monthlyData) {
      if (homeMonthlyChart) homeMonthlyChart.destroy();
      homeMonthlyChart = new Chart(monthlyCtx, {
        type: 'bar',
        data: { labels: data.monthlyData.map(d => d.label), datasets: [{ data: data.monthlyData.map(d => d.count), backgroundColor: data.monthlyData.map((_, i) => i === data.monthlyData.length - 1 ? 'rgba(232,160,32,.8)' : 'rgba(232,160,32,.35)'), borderColor: 'rgba(232,160,32,.6)', borderWidth: 1, borderRadius: 8, borderSkipped: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(12,26,58,.95)', titleColor: '#fff', bodyColor: '#E8A020', borderColor: 'rgba(232,160,32,.3)', borderWidth: 1, cornerRadius: 10, padding: 10, callbacks: { label: (ctx) => `${ctx.raw} visita${ctx.raw !== 1 ? 's' : ''}` } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(255,255,255,.04)' } }, x: { grid: { display: false } } }, animation: { duration: 1000, easing: 'easeOutQuart' } }
      });
    }

    // Seller chart
    const sellerCtx = document.getElementById('homeSellerChart');
    if (sellerCtx && data.perSeller && data.perSeller.length > 0) {
      if (homeSellerChart) homeSellerChart.destroy();
      const sellers = data.perSeller.slice(0, 8);
      const colors = ['#41C6F6', '#3EB2F5', '#0FC2E5', '#2ED573', '#E8A020', '#F0C060', '#FF6B6B', '#A78BFA'];
      homeSellerChart = new Chart(sellerCtx, {
        type: 'bar',
        data: { labels: sellers.map(s => s.name.split(' ')[0]), datasets: [{ data: sellers.map(s => s.visit_count), backgroundColor: sellers.map((_, i) => colors[i % colors.length] + '66'), borderColor: sellers.map((_, i) => colors[i % colors.length]), borderWidth: 1, borderRadius: 6, borderSkipped: false }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(12,26,58,.95)', titleColor: '#fff', bodyColor: '#41C6F6', borderColor: 'rgba(65,198,246,.3)', borderWidth: 1, cornerRadius: 10, padding: 10, callbacks: { title: (items) => sellers[items[0].dataIndex]?.name || '', label: (ctx) => `${ctx.raw} visita${ctx.raw !== 1 ? 's' : ''}` } } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { grid: { display: false } } }, animation: { duration: 1000, easing: 'easeOutQuart' } }
      });
    }
  } catch (e) { console.error('Admin dashboard error:', e); }
}

// ── Vendedor Dashboard ──
async function loadVendedorStats() {
  try {
    const data = await api('/api/visits/stats/me');

    // Update stat cards
    const statCards = document.querySelectorAll('#home-dashboard .stat-card');
    if (statCards.length >= 4) {
      statCards[0].innerHTML = `<div class="stat-num">${data.todayVisits}</div><div class="stat-lbl">Hoy</div>`;
      statCards[0].classList.remove('shimmer');
      statCards[1].innerHTML = `<div class="stat-num">${data.monthVisits}</div><div class="stat-lbl">Este Mes</div>`;
      statCards[1].classList.remove('shimmer');
      statCards[2].innerHTML = `<div class="stat-num">${data.total}</div><div class="stat-lbl">Total</div>`;
      statCards[2].classList.remove('shimmer');
      statCards[3].innerHTML = `<div class="stat-num">${data.uniqueClients}</div><div class="stat-lbl">Clientes</div>`;
      statCards[3].classList.remove('shimmer');
    }

    // Weekly chart
    renderVendedorChart(data.dailyData);
  } catch (e) { console.error('Stats error:', e); }
}

function renderVendedorChart(dailyData) {
  const ctx = document.getElementById('vendedorChart');
  if (!ctx) return;
  if (vendedorChart) vendedorChart.destroy();

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(65,198,246,.35)');
  gradient.addColorStop(1, 'rgba(65,198,246,.02)');

  vendedorChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dailyData.map(d => d.label),
      datasets: [{
        data: dailyData.map(d => d.count),
        backgroundColor: dailyData.map((d, i) => i === dailyData.length - 1 ? 'rgba(65,198,246,.8)' : 'rgba(65,198,246,.35)'),
        borderColor: 'rgba(65,198,246,.6)',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: 'rgba(12,26,58,.95)', titleColor: '#fff', bodyColor: '#41C6F6',
        borderColor: 'rgba(65,198,246,.3)', borderWidth: 1, cornerRadius: 10, padding: 10,
        callbacks: { label: (ctx) => `${ctx.raw} visita${ctx.raw !== 1 ? 's' : ''}` }
      }},
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: 'rgba(255,255,255,.3)' }, grid: { color: 'rgba(255,255,255,.04)' } },
               x: { ticks: { color: 'rgba(255,255,255,.4)' }, grid: { display: false } } },
      animation: { duration: 800, easing: 'easeOutQuart' }
    }
  });
}

// ── Tabs ──
function initTabs() {
  const vendedorTabs = [
    { icon: 'home', label: 'Inicio', screen: 's-home' },
    { icon: 'add-circle', label: 'Nueva', screen: 's-nueva' },
    { icon: 'document-text', label: 'Levant.', screen: 's-levantamiento' },
    { icon: 'list', label: 'Historial', screen: 's-hist' }
  ];
  const adminTabs = [
    { icon: 'home', label: 'Inicio', screen: 's-home' },
    { icon: 'list', label: 'Historial', screen: 's-hist' },
    { icon: 'shield-checkmark', label: 'Admin', screen: 's-admin' }
  ];
  const tabs = currentUser?.role === 'admin' ? adminTabs : vendedorTabs;
  const ids = ['tabBar', 'tabBar2', 'tabBar3', 'tabBar4', 'tabBar5'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = tabs.map((t, i) => `<button class="tab-btn" onclick="switchTab(${i})"><ion-icon name="${t.icon}"></ion-icon>${t.label}</button>`).join('');
  });
}

function switchTab(i) {
  const vendedorSc = ['s-home', 's-nueva', 's-levantamiento', 's-hist'];
  const adminSc = ['s-home', 's-hist', 's-admin'];
  const screens = currentUser?.role === 'admin' ? adminSc : vendedorSc;
  if (i >= screens.length) return;
  showScreen(screens[i]);
  navHistory = [];
  document.querySelectorAll('.tab-btn').forEach((b, j) => {
    b.classList.toggle('active', j % screens.length === i);
  });
  if (screens[i] === 's-hist') renderHistory();
  if (screens[i] === 's-nueva') initNewForm();
  if (screens[i] === 's-levantamiento') lev_init();
  if (screens[i] === 's-home') {
    if (currentUser?.role === 'admin') loadAdminHomeDashboard();
    else loadVendedorStats();
  }
  if (screens[i] === 's-admin') { loadAdminStats(); loadAdminVisits(); }
}

// ── New Visit Form ──
let fotoIngresoData = null;
let fotoAdicionalData = null;
let knownClients = [];
let knownContacts = [];

async function initNewForm() {
  const now = new Date();
  document.getElementById('n-fecha').value = now.toISOString().split('T')[0];
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('n-hora-ingreso').value = timeStr;
  
  document.getElementById('n-cliente').value = '';
  document.getElementById('n-hora-salida').value = '';
  document.getElementById('n-dir').value = '';
  document.getElementById('n-contacto').value = '';
  document.getElementById('n-cargo').value = '';
  document.getElementById('n-telefono').value = '';
  document.getElementById('n-mail').value = '';
  document.getElementById('n-desc').value = '';
  
  removeFoto('ingreso');
  removeFoto('adicional');

  const cListEl = document.getElementById('n-cliente-list');
  if (cListEl) cListEl.style.display = 'none';
  const pListEl = document.getElementById('n-contacto-list');
  if (pListEl) pListEl.style.display = 'none';

  // Load unique clients & contacts from past visits asynchronously
  try {
    const data = await api('/api/visits');
    const visits = data.visits || [];
    const cmap = {};
    const pmap = {};
    for (let i = visits.length - 1; i >= 0; i--) {
      const v = visits[i];
      if (v.cliente && !cmap[v.cliente]) {
        cmap[v.cliente] = {
          cliente: v.cliente, direccion: v.direccion || '', contacto: v.contacto || '',
          cargo: v.cargo || '', telefono: v.telefono || '', mail: v.mail || ''
        };
      }
      if (v.contacto) {
        const pKey = `${(v.cliente || '')}|${v.contacto}`;
        if (!pmap[pKey]) {
          pmap[pKey] = {
            contacto: v.contacto, cargo: v.cargo || '',
            telefono: v.telefono || '', mail: v.mail || '',
            cliente: v.cliente || ''
          };
        }
      }
    }
    knownClients = Object.values(cmap);
    knownContacts = Object.values(pmap);
  } catch(e) {}
}

// -- Client Autocomplete --
function handleClientSearch() {
  const q = document.getElementById('n-cliente').value.toLowerCase();
  const listEl = document.getElementById('n-cliente-list');
  if (!q) { listEl.style.display = 'none'; return; }
  
  const matches = knownClients.filter(c => c.cliente.toLowerCase().includes(q));
  if (!matches.length) {
    listEl.style.display = 'none'; 
    return;
  }
  
  listEl.innerHTML = matches.map(c => `
    <div class="ac-item" onclick="selectClient('${esc(c.cliente)}')">
      <ion-icon name="business"></ion-icon> <div>${esc(c.cliente)}</div>
    </div>
  `).join('');
  listEl.style.display = 'flex';
}

function toggleClientList() {
  const listEl = document.getElementById('n-cliente-list');
  if (listEl.style.display === 'flex') {
    listEl.style.display = 'none';
  } else {
    if (!knownClients.length) return;
    listEl.innerHTML = knownClients.map(c => `
      <div class="ac-item" onclick="selectClient('${esc(c.cliente)}')">
        <ion-icon name="business"></ion-icon> <div>${esc(c.cliente)}</div>
      </div>
    `).join('');
    listEl.style.display = 'flex';
  }
}

function selectClient(name) {
  const c = knownClients.find(x => x.cliente === name);
  if (c) {
    document.getElementById('n-cliente').value = c.cliente;
    document.getElementById('n-dir').value = c.direccion;
    document.getElementById('n-contacto').value = c.contacto;
    document.getElementById('n-cargo').value = c.cargo;
    document.getElementById('n-telefono').value = c.telefono;
    document.getElementById('n-mail').value = c.mail;
  }
  const listEl = document.getElementById('n-cliente-list');
  if (listEl) listEl.style.display = 'none';
}

// -- Contact Autocomplete --
function handleContactSearch() {
  const q = document.getElementById('n-contacto').value.toLowerCase();
  const cName = document.getElementById('n-cliente').value.toLowerCase().trim();
  const listEl = document.getElementById('n-contacto-list');
  if (!q && !cName) { listEl.style.display = 'none'; return; }
  
  let matches = knownContacts;
  if (cName) {
    matches = matches.filter(c => c.cliente.toLowerCase() === cName);
  }
  if (q) {
    matches = matches.filter(c => c.contacto.toLowerCase().includes(q));
  }
  
  if (!matches.length) {
    listEl.style.display = 'none'; 
    return;
  }
  
  listEl.innerHTML = matches.map(c => `
    <div class="ac-item" onclick="selectContact('${esc(c.contacto)}')">
      <ion-icon name="person"></ion-icon> <div>${esc(c.contacto)}</div>
    </div>
  `).join('');
  listEl.style.display = 'flex';
}

function toggleContactList() {
  const cName = document.getElementById('n-cliente').value.toLowerCase().trim();
  const listEl = document.getElementById('n-contacto-list');
  if (listEl.style.display === 'flex') {
    listEl.style.display = 'none';
  } else {
    let matches = knownContacts;
    if (cName) {
      matches = matches.filter(c => c.cliente.toLowerCase() === cName);
    }
    if (!matches.length) return;
    listEl.innerHTML = matches.map(c => `
      <div class="ac-item" onclick="selectContact('${esc(c.contacto)}')">
        <ion-icon name="person"></ion-icon> <div>${esc(c.contacto)}</div>
      </div>
    `).join('');
    listEl.style.display = 'flex';
  }
}

function selectContact(name) {
  const c = knownContacts.find(x => x.contacto === name);
  if (c) {
    document.getElementById('n-contacto').value = c.contacto;
    document.getElementById('n-cargo').value = c.cargo;
    document.getElementById('n-telefono').value = c.telefono;
    document.getElementById('n-mail').value = c.mail;
  }
  const listEl = document.getElementById('n-contacto-list');
  if (listEl) listEl.style.display = 'none';
}

// Close dropdowns if clicked outside
document.addEventListener('click', (e) => {
  const cWrap = e.target.closest('#n-cliente-wrap');
  if (!cWrap) {
    const listEl = document.getElementById('n-cliente-list');
    if (listEl) listEl.style.display = 'none';
  }
  const pWrap = e.target.closest('#n-contacto-wrap');
  if (!pWrap) {
    const listEl = document.getElementById('n-contacto-list');
    if (listEl) listEl.style.display = 'none';
  }
});

function handleFoto(type, e) {
  const f = e.target.files[0]; if (!f) return;
  compressImage(f, (dataUrl) => {
    if (type === 'ingreso') {
      fotoIngresoData = dataUrl;
      document.getElementById('img-ingreso').src = fotoIngresoData;
      document.getElementById('preview-ingreso').style.display = 'block';
      document.getElementById('btn-foto-ingreso').style.display = 'none';
    } else {
      fotoAdicionalData = dataUrl;
      document.getElementById('img-adicional').src = fotoAdicionalData;
      document.getElementById('preview-adicional').style.display = 'block';
      document.getElementById('btn-foto-adicional').style.display = 'none';
    }
  });
}

function removeFoto(type) {
  if (type === 'ingreso') {
    fotoIngresoData = null;
    document.getElementById('preview-ingreso').style.display = 'none';
    document.getElementById('btn-foto-ingreso').style.display = 'flex';
  } else {
    fotoAdicionalData = null;
    document.getElementById('preview-adicional').style.display = 'none';
    document.getElementById('btn-foto-adicional').style.display = 'flex';
  }
}

async function saveNewVisit() {
  const cliente = document.getElementById('n-cliente').value.trim();
  const dir = document.getElementById('n-dir').value.trim();
  const hSalida = document.getElementById('n-hora-salida').value.trim();
  const contacto = document.getElementById('n-contacto').value.trim();
  const cargo = document.getElementById('n-cargo').value.trim();

  // Validations (*)
  if (!cliente) return toast('El campo Cliente es obligatorio', 'err');
  if (!hSalida) return toast('La Hora de Salida es obligatoria', 'err');
  if (!dir) return toast('El campo Dirección es obligatorio', 'err');
  if (!contacto) return toast('El Contacto es obligatorio', 'err');
  if (!cargo) return toast('El Cargo es obligatorio', 'err');
  if (!fotoIngresoData) return toast('La Foto de Ingreso es obligatoria', 'err');

  const btn = document.getElementById('btnSaveNew');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin-right:6px"></div> Guardando...';
  try {
    const fd = new FormData();
    fd.append('fecha', document.getElementById('n-fecha').value);
    fd.append('hora', document.getElementById('n-hora-ingreso').value);
    fd.append('hora_salida', hSalida);
    fd.append('cliente', cliente);
    fd.append('direccion', dir);
    fd.append('contacto', contacto);
    fd.append('cargo', cargo);
    fd.append('telefono', document.getElementById('n-telefono').value.trim());
    fd.append('mail', document.getElementById('n-mail').value.trim());
    fd.append('descripcion', document.getElementById('n-desc').value.trim());
    if (fotoIngresoData) fd.append('foto', dataURLtoBlob(fotoIngresoData), 'foto.jpg');
    if (fotoAdicionalData) fd.append('foto_adicional', dataURLtoBlob(fotoAdicionalData), 'foto_adicional.jpg');

    await api('/api/visits', { method: 'POST', body: fd });
    toast('✓ Visita guardada correctamente', 'ok');

    // Reset and immediately redirect to History
    initNewForm();
    switchTab(3);

  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
  btn.innerHTML = '<ion-icon name="checkmark-circle-outline" style="font-size:20px;margin-right:6px"></ion-icon>GUARDAR VISITA';
}

// ── History ──
let histGroupMode = 'client';

function setHistGroup(mode) {
  histGroupMode = mode;
  document.querySelectorAll('.hist-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.group === mode);
  });
  renderHistory();
}

async function renderHistory() {
  const search = document.getElementById('h-search').value || '';
  const isAdmin = currentUser?.role === 'admin';

  try {
    let visits;
    if (isAdmin) {
      const data = await api(`/api/admin/visits?search=${encodeURIComponent(search)}`);
      visits = data.visits || [];
    } else {
      const data = await api(`/api/visits?search=${encodeURIComponent(search)}`);
      visits = data.visits || [];
    }

    const clients = new Set(visits.map(v => v.cliente));
    const monthsSet = new Set(visits.map(v => {
      const d = v.fecha ? new Date(v.fecha + 'T00:00:00') : new Date(v.created_at);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    
    document.getElementById('st-total').textContent = visits.length;
    document.getElementById('st-clients').textContent = clients.size;
    document.getElementById('st-months').textContent = monthsSet.size;

    const el = document.getElementById('h-list');
    if (!visits.length) {
      el.innerHTML = '<div class="empty"><ion-icon name="file-tray-outline"></ion-icon><p>No hay visitas registradas</p></div>';
      return;
    }

    if (histGroupMode === 'month') {
      el.innerHTML = renderGroupedByMonth(visits, isAdmin);
    } else {
      el.innerHTML = renderGroupedByClient(visits, isAdmin);
    }
  } catch (e) {
    toast('Error al cargar historial', 'err');
  }
}

function renderGroupedByClient(visits, isAdmin) {
  const groups = {};
  visits.forEach(v => {
    const key = v.cliente || 'Sin cliente';
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });
  
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  return sorted.map(([client, items]) => `
    <div class="gc-wrapper">
      <div class="gc-header">
        <div class="gc-title"><ion-icon name="business" style="font-size:18px;color:var(--cyan)"></ion-icon>${esc(client)}</div>
        <div class="gc-badge">${items.length}</div>
        <div class="gc-btn-nueva" onclick="switchTab(1)"><ion-icon name="add-circle"></ion-icon> Nueva</div>
      </div>
      ${items.map(v => gcVisitCardHTML(v, isAdmin)).join('')}
    </div>
  `).join('');
}

function renderGroupedByMonth(visits, isAdmin) {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const groups = {};
  visits.forEach(v => {
    const d = v.fecha ? new Date(v.fecha + 'T00:00:00') : new Date(v.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${months[d.getMonth()]} ${d.getFullYear()}`;
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(v);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  
  return sorted.map(([, { label, items }]) => `
    <div class="gc-wrapper">
      <div class="gc-header" style="border-color:rgba(232,160,32,.2)">
        <div class="gc-title"><ion-icon name="calendar" style="font-size:18px;color:var(--amber)"></ion-icon>${label}</div>
        <div class="gc-badge" style="background:var(--amber)">${items.length}</div>
        <div class="gc-btn-nueva" onclick="switchTab(1)"><ion-icon name="add-circle"></ion-icon> Nueva</div>
      </div>
      ${items.map(v => gcVisitCardHTML(v, isAdmin)).join('')}
    </div>
  `).join('');
}

function histExportCSV() {
  if (currentUser?.role === 'admin') adminExportCSV();
  else exportCSV();
}

function gcVisitCardHTML(v, showSeller) {
  const photoTag = v.foto_url 
    ? `<div class="gc-v-foot"><ion-icon name="camera" style="font-size:14px"></ion-icon> Con foto</div>` 
    : '';

  return `<div class="gc-visit" onclick="showDetail('${v.id}')" style="cursor:pointer">
    <div class="gc-v-actions" onclick="event.stopPropagation()">
      <ion-icon name="create-outline" onclick="editVisit('${v.id}')"></ion-icon>
      <ion-icon name="trash-outline" onclick="deleteVisit('${v.id}')"></ion-icon>
    </div>
    
    <div class="gc-v-row" style="margin-bottom:2px"><ion-icon name="calendar-outline"></ion-icon> ${v.fecha || 'Sin fecha'}</div>
    <div class="gc-v-row" style="margin-bottom:8px"><ion-icon name="time-outline"></ion-icon> ${(v.hora || 'Sin hora').substring(0,5)}</div>
    
    ${v.direccion ? `<div class="gc-v-row"><ion-icon name="location-outline"></ion-icon> ${esc(v.direccion)}</div>` : ''}
    ${v.contacto ? `<div class="gc-v-row"><ion-icon name="person-outline"></ion-icon> ${esc(v.contacto)}</div>` : ''}
    ${showSeller && v.seller_name ? `<div class="gc-v-row" style="color:var(--amber)"><ion-icon name="person-circle-outline"></ion-icon> ${esc(v.seller_name)}</div>` : ''}
    
    ${v.descripcion ? `<div class="gc-v-desc">${esc(v.descripcion)}</div>` : ''}
    ${photoTag}
  </div>`;
}

// ── Detail ──
async function showDetail(id) {
  currentVisitId = id;
  navHistory.push(document.querySelector('.screen.active').id);
  try {
    let v;
    if (currentUser.role === 'admin') {
      const data = await api(`/api/admin/visits`);
      v = (data.visits || []).find(x => x.id === id);
    } else {
      const data = await api(`/api/visits/${id}`);
      v = data.visit;
    }
    if (!v) return toast('Visita no encontrada', 'err');
    const el = document.getElementById('d-content');
    const photoSrc = v.foto_url ? (v.foto_url.startsWith('http') ? v.foto_url : `${API}${v.foto_url}`) : '';
    el.innerHTML = `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:12px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:16px">
        <ion-icon name="business" style="font-size:24px;color:var(--cyan)"></ion-icon>
        <h3 style="font-size:20px;font-weight:800">${esc(v.cliente)}</h3>
      </div>
      ${v.seller_name ? `<div class="det-item"><ion-icon name="person"></ion-icon><div><div class="lbl2">Vendedor</div><div class="val">${esc(v.seller_name)}</div></div></div>` : ''}
      <div class="det-item"><ion-icon name="calendar-outline"></ion-icon><div><div class="lbl2">Fecha</div><div class="val">${fmtDate(v.fecha)}</div></div></div>
      <div class="det-item"><ion-icon name="time-outline"></ion-icon><div><div class="lbl2">Hora Ingreso</div><div class="val">${esc(v.hora || '—')}</div></div></div>
      <div class="det-item"><ion-icon name="time"></ion-icon><div><div class="lbl2">Hora Salida</div><div class="val">${esc(v.hora_salida || '—')}</div></div></div>
      <div class="det-item"><ion-icon name="location-outline"></ion-icon><div><div class="lbl2">Dirección</div><div class="val">${esc(v.direccion || '—')}</div></div></div>
      <div class="det-item"><ion-icon name="person-outline"></ion-icon><div><div class="lbl2">Contacto</div><div class="val">${esc(v.contacto || '—')}</div></div></div>
      ${v.cargo ? `<div class="det-item"><ion-icon name="briefcase-outline"></ion-icon><div><div class="lbl2">Cargo</div><div class="val">${esc(v.cargo)}</div></div></div>` : ''}
      ${v.telefono ? `<div class="det-item"><ion-icon name="call-outline"></ion-icon><div><div class="lbl2">Teléfono</div><div class="val">${esc(v.telefono)}</div></div></div>` : ''}
      ${v.mail ? `<div class="det-item"><ion-icon name="mail-outline"></ion-icon><div><div class="lbl2">Email</div><div class="val">${esc(v.mail)}</div></div></div>` : ''}
      ${v.descripcion ? `<div style="margin-top:8px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><ion-icon name="document-text" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Descripción</span></div>
        <div class="desc-box" style="-webkit-line-clamp:unset">${esc(v.descripcion)}</div></div>` : ''}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:var(--t50)">
        Creado: ${v.created_at ? new Date(v.created_at).toLocaleString('es-CL') : '—'} · Editado: ${v.updated_at ? new Date(v.updated_at).toLocaleString('es-CL') : '—'}
      </div>
    </div>
    ${photoSrc ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><ion-icon name="camera" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Foto de Ingreso</span></div><img src="${photoSrc}" class="det-photo" onclick="openModal(this.src)"></div>` : ''}
    ${v.foto_adicional_url ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><ion-icon name="images" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Foto Adicional</span></div><img src="${v.foto_adicional_url.startsWith('http') ? v.foto_adicional_url : API + v.foto_adicional_url}" class="det-photo" onclick="openModal(this.src)"></div>` : ''}
    <button class="btn-cyan" onclick="editVisit('${v.id}')" style="margin-bottom:10px"><ion-icon name="create-outline" style="font-size:18px"></ion-icon>EDITAR VISITA</button>
    <button class="btn-glass" onclick="deleteVisit('${v.id}')" style="border-color:rgba(255,68,68,.3);color:var(--danger)"><ion-icon name="trash-outline" style="font-size:18px"></ion-icon>ELIMINAR VISITA</button>`;
    showScreen('s-detail');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function editCurrent() { if (currentVisitId) editVisit(currentVisitId); }

// ── Edit ──
async function editVisit(id) {
  currentVisitId = id;
  navHistory.push(document.querySelector('.screen.active').id);
  try {
    let v;
    if (currentUser.role === 'admin') {
      const data = await api(`/api/admin/visits`);
      v = (data.visits || []).find(x => x.id === id);
    } else {
      const data = await api(`/api/visits/${id}`);
      v = data.visit;
    }
    if (!v) return;
    editPhotoData = v.foto_url ? (v.foto_url.startsWith('http') ? v.foto_url : `${API}${v.foto_url}`) : null;
    editPhotoChanged = false;
    const el = document.getElementById('e-content');
    el.innerHTML = `<div class="card">
      <div class="row" style="margin-bottom:14px"><div><label class="lbl">Fecha</label><input class="inp inp-simple" type="date" id="e-fecha" value="${v.fecha}"></div><div><label class="lbl">Hora Ingreso</label><input class="inp inp-simple" type="time" id="e-hora-ingreso" value="${v.hora || ''}"></div></div>
      <div style="margin-bottom:14px"><label class="lbl">Hora Salida</label><input class="inp inp-simple" type="time" id="e-hora-salida" value="${v.hora_salida || ''}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Cliente *</label><input class="inp inp-simple" id="e-cliente" value="${esc(v.cliente)}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Dirección *</label><input class="inp inp-simple" id="e-dir" value="${esc(v.direccion || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Contacto</label><input class="inp inp-simple" id="e-contacto" value="${esc(v.contacto || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Cargo</label><input class="inp inp-simple" id="e-cargo" value="${esc(v.cargo || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Teléfono</label><input class="inp inp-simple" id="e-telefono" value="${esc(v.telefono || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Mail</label><input class="inp inp-simple" id="e-mail" value="${esc(v.mail || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Descripción</label><textarea class="inp inp-simple" id="e-desc">${esc(v.descripcion || '')}</textarea></div>
      <div style="margin-bottom:16px"><label class="lbl">Foto</label>
        <div id="e-photo-btns" class="photo-btns" style="${editPhotoData ? 'display:none' : ''}">
          <label class="photo-pick"><ion-icon name="camera"></ion-icon><span>📷 Cámara</span><input type="file" accept="image/*" capture="environment" onchange="handleEditPhoto(event)" style="display:none"></label>
          <label class="photo-pick"><ion-icon name="images"></ion-icon><span>🖼️ Galería</span><input type="file" accept="image/*" onchange="handleEditPhoto(event)" style="display:none"></label>
        </div>
        <div id="e-photo-preview" class="photo-preview" style="${editPhotoData ? '' : 'display:none'}"><img id="e-photo-img" src="${editPhotoData || ''}"><button class="rm" onclick="removeEditPhoto()">✕</button></div>
      </div>
      <button class="btn-cyan" id="btnSaveEdit" onclick="saveEdit('${id}')"><ion-icon name="save-outline" style="font-size:20px"></ion-icon>GUARDAR CAMBIOS</button>
    </div>`;
    showScreen('s-edit');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function handleEditPhoto(e) {
  const f = e.target.files[0]; if (!f) return;
  compressImage(f, (dataUrl) => {
    editPhotoData = dataUrl;
    editPhotoChanged = true;
    document.getElementById('e-photo-img').src = editPhotoData;
    document.getElementById('e-photo-preview').style.display = 'block';
    document.getElementById('e-photo-btns').style.display = 'none';
  });
}

function removeEditPhoto() {
  editPhotoData = null; editPhotoChanged = true;
  document.getElementById('e-photo-preview').style.display = 'none';
  document.getElementById('e-photo-btns').style.display = 'flex';
}

async function saveEdit(id) {
  const cliente = document.getElementById('e-cliente').value.trim();
  const dir = document.getElementById('e-dir').value.trim();
  if (!cliente) return toast('El campo Cliente es obligatorio', 'err');
  if (!dir) return toast('El campo Dirección es obligatorio', 'err');
  const btn = document.getElementById('btnSaveEdit');
  btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append('fecha', document.getElementById('e-fecha').value);
    fd.append('hora', document.getElementById('e-hora-ingreso').value);
    fd.append('hora_salida', document.getElementById('e-hora-salida').value.trim());
    fd.append('cliente', cliente);
    fd.append('direccion', dir);
    fd.append('contacto', document.getElementById('e-contacto').value.trim());
    fd.append('cargo', document.getElementById('e-cargo').value.trim());
    fd.append('telefono', document.getElementById('e-telefono').value.trim());
    fd.append('mail', document.getElementById('e-mail').value.trim());
    fd.append('descripcion', document.getElementById('e-desc').value.trim());
    if (editPhotoChanged) {
      if (!editPhotoData) fd.append('remove_photo', 'true');
      else if (editPhotoData.startsWith('data:')) fd.append('foto', dataURLtoBlob(editPhotoData), 'foto.jpg');
    }
    const endpoint = currentUser.role === 'admin' ? `/api/admin/visits/${id}` : `/api/visits/${id}`;
    await api(endpoint, { method: 'PUT', body: fd });
    toast('✓ Visita actualizada', 'ok');
    goBack();
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
}

// ── Delete ──
async function deleteVisit(id) {
  if (!confirm('¿Eliminar esta visita? Esta acción no se puede deshacer.')) return;
  try {
    const endpoint = currentUser.role === 'admin' ? `/api/admin/visits/${id}` : `/api/visits/${id}`;
    await api(endpoint, { method: 'DELETE' });
    toast('✓ Visita eliminada', 'ok');
    const active = document.querySelector('.screen.active').id;
    if (active === 's-detail' || active === 's-edit') goBack();
    else if (active === 's-seller-hist') showSellerHistory(currentSellerEmail, document.getElementById('sh-title').textContent);
    else renderHistory();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── CSV Export ──
async function exportCSV() {
  try {
    const res = await fetch(`${API}/api/visits/export/csv`, { headers: { 'Authorization': `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'visitas_inpamind.csv';
    a.click();
    toast('CSV descargado ✅', 'ok');
  } catch (e) { toast('Error al exportar', 'err'); }
}

// ── Admin Panel — Sellers List ──
async function loadAdminStats() {
  try {
    const data = await api('/api/admin/sellers');
    const sellers = data.sellers || [];
    const el = document.getElementById('admin-sellers-list');
    if (!sellers.length) {
      el.innerHTML = '<div class="empty"><ion-icon name="people-outline"></ion-icon><p>No hay vendedores registrados</p></div>';
      return;
    }
    el.innerHTML = sellers.map(s => `
      <div class="seller-card" style="cursor:pointer" onclick="showSellerHistory('${esc(s.email)}', '${esc(s.name)}')">
        <ion-icon name="person-circle" style="font-size:40px;color:${s.active ? 'var(--cyan)' : 'var(--danger)'}"></ion-icon>
        <div class="seller-info" style="flex:1">
          <div class="seller-name">${esc(s.name)}</div>
          <div class="seller-email">${esc(s.email)}</div>
          <div class="seller-count">${s.visit_count} visitas · ${s.active ? '✅ Activo' : '🚫 Inactivo'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <button class="toggle-btn ${s.active ? 'toggle-active' : 'toggle-inactive'}" onclick="event.stopPropagation();toggleSeller('${s.id}')">
            ${s.active ? 'Desactivar' : 'Activar'}
          </button>
          <ion-icon name="chevron-forward" style="font-size:18px;color:var(--t50)"></ion-icon>
        </div>
      </div>`).join('');
  } catch (e) { console.error(e); }
}

async function loadAdminVisits() {
  // Kept for backward compatibility, just reload sellers
  loadAdminStats();
}

async function toggleSeller(id) {
  try {
    const data = await api(`/api/admin/sellers/${id}`, { method: 'PUT' });
    toast(data.message, 'ok');
    loadAdminStats();
  } catch (e) { toast(e.message, 'err'); }
}

// ── Seller History Screen ──
let sellerHistVisits = [];
let currentSellerEmail = '';

async function showSellerHistory(email, name) {
  currentSellerEmail = email;
  navHistory.push('s-admin');
  document.getElementById('sh-title').textContent = name;
  document.getElementById('sh-search').value = '';
  document.getElementById('sh-list').innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
  showScreen('s-seller-hist');

  try {
    const data = await api(`/api/admin/visits?seller=${encodeURIComponent(email)}`);
    sellerHistVisits = data.visits || [];
    renderSellerHistory(sellerHistVisits);
  } catch (e) {
    toast('Error al cargar historial', 'err');
  }
}

function filterSellerHistory() {
  const q = (document.getElementById('sh-search').value || '').toLowerCase();
  if (!q) return renderSellerHistory(sellerHistVisits);
  const filtered = sellerHistVisits.filter(v =>
    (v.cliente || '').toLowerCase().includes(q) ||
    (v.direccion || '').toLowerCase().includes(q) ||
    (v.contacto || '').toLowerCase().includes(q) ||
    (v.descripcion || '').toLowerCase().includes(q)
  );
  renderSellerHistory(filtered);
}

function renderSellerHistory(visits) {
  const clients = new Set(visits.map(v => v.cliente));
  document.getElementById('sh-total').textContent = visits.length + ' visitas';
  document.getElementById('sh-clients').textContent = clients.size + ' clientes';
  const el = document.getElementById('sh-list');
  if (!visits.length) {
    el.innerHTML = '<div class="empty"><ion-icon name="file-tray-outline"></ion-icon><p>No hay visitas registradas</p></div>';
    return;
  }
  el.innerHTML = renderGroupedByClient(visits, false);
}

async function adminExportCSV() {
  try {
    const res = await fetch(`${API}/api/admin/export/csv`, { headers: { 'Authorization': `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inpamind_todas_visitas.csv';
    a.click();
    toast('CSV global descargado ✅', 'ok');
  } catch (e) { toast('Error al exportar', 'err'); }
}

// ── Modal ──
function openModal(src) { document.getElementById('modalImg').src = src; document.getElementById('photoModal').classList.add('show'); }
function closeModal() { document.getElementById('photoModal').classList.remove('show'); }

// ── Password Toggle ──
function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  const icon = btn.querySelector('ion-icon');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.setAttribute('name', 'eye-off-outline');
  } else {
    inp.type = 'password';
    icon.setAttribute('name', 'eye-outline');
  }
}

// ── Helpers ──
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(f) { if (!f) return '—'; const p = f.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f; }
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}
function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Cargando...';
  document.getElementById('loadingOverlay').style.display = 'flex';
}
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

// ── Image Compression ──
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

function compressImage(file, callback, maxW = 1200, quality = 0.8) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Splash Screen ──
function hideSplash() {
  const splash = document.getElementById('splash');
  const appFrame = document.getElementById('app-frame');
  if (splash) {
    splash.classList.add('hide');
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }
  if (appFrame) {
    appFrame.style.opacity = '1';
  }
}

// ── Init ──
window.onload = async function () {
  // Wait for splash animation to complete (at least 2.3s)
  const splashDelay = new Promise(resolve => setTimeout(resolve, 2300));

  let appReady;
  if (token) {
    try {
      const data = await api('/api/auth/me');
      currentUser = data.user;
      appReady = 'authenticated';
    } catch (e) {
      token = null;
      localStorage.removeItem('inpamind_token');
      appReady = 'login';
    }
  } else {
    appReady = 'login';
  }

  await splashDelay;
  hideSplash();

  if (appReady === 'authenticated') {
    enterApp();
  } else {
    showScreen('s-login');
  }
};

// Enter key on login/register
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.querySelector('.screen.active')?.id;
  if (active === 's-login') doLogin();
  else if (active === 's-register') doRegister();
});

// ══════════════════════════════════════════════════════════════
//  LEVANTAMIENTO TÉCNICO — Funciones lev_*
// ══════════════════════════════════════════════════════════════

const LEV_FIELDS = ['lev-visita','lev-filtro','lev-nombreFiltro','lev-empresa','lev-contacto','lev-cargo','lev-medA','lev-medB','lev-medC','lev-diametro','lev-temperatura','lev-material','lev-observaciones'];

function lev_getVisitas() {
  try { return JSON.parse(localStorage.getItem('lev_historial') || '[]'); }
  catch(e) { return []; }
}

function lev_getFiltros() {
  try { return JSON.parse(localStorage.getItem('lev_filtros')) || []; }
  catch(e) { return []; }
}

function lev_asignarVisita() {
  const visitas = lev_getVisitas();
  const siguiente = visitas.length > 0
    ? Math.max(...visitas.map(v => parseInt(v.numero) || 0)) + 1
    : 1;
  const el = document.getElementById('lev-visita');
  const disp = document.getElementById('lev-visita-display');
  if (el) el.value = siguiente;
  if (disp) disp.textContent = String(siguiente).padStart(3, '0');
  return siguiente;
}

function lev_init() {
  // Cargar clientes conocidos si aún no están disponibles
  if (!knownClients.length) {
    api('/api/visits').then(data => {
      const cmap = {};
      (data.visits || []).forEach(v => {
        if (v.cliente && !cmap[v.cliente]) {
          cmap[v.cliente] = { cliente: v.cliente, contacto: v.contacto || '', cargo: v.cargo || '', direccion: v.direccion || '', telefono: v.telefono || '', mail: v.mail || '' };
        }
      });
      knownClients = Object.values(cmap);
    }).catch(() => {});
  }

  // Restaurar form guardado
  const saved = localStorage.getItem('lev_form');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      LEV_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && data[id] !== undefined) el.value = data[id];
      });
    } catch(e) {}
  }
  lev_renderFiltros();

  // Número de visita
  const elVisita = document.getElementById('lev-visita');
  if (elVisita && !elVisita.value) {
    lev_asignarVisita();
  } else if (elVisita) {
    const disp = document.getElementById('lev-visita-display');
    if (disp) disp.textContent = String(elVisita.value).padStart(3, '0');
  }

  // Número de filtro siguiente
  const lista = lev_getFiltros();
  const siguiente = lista.length > 0 ? Math.max(...lista.map(f => parseInt(f['lev-filtro']) || 0)) + 1 : 1;
  const elFiltro = document.getElementById('lev-filtro');
  if (elFiltro && !elFiltro.value) elFiltro.value = siguiente;

  // Sincronizar empresa en filtros al escribir
  ['lev-empresa','lev-contacto','lev-cargo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.removeEventListener('input', lev_sincronizarEmpresa); el.addEventListener('input', lev_sincronizarEmpresa); }
  });
}

function lev_sincronizarEmpresa() {
  const empresa  = (document.getElementById('lev-empresa')?.value  || '').trim();
  const contacto = (document.getElementById('lev-contacto')?.value || '').trim();
  const cargo    = (document.getElementById('lev-cargo')?.value    || '').trim();
  const lista = lev_getFiltros().map(f => ({ ...f, 'lev-empresa': empresa, 'lev-contacto': contacto, 'lev-cargo': cargo }));
  localStorage.setItem('lev_filtros', JSON.stringify(lista));
  lev_renderFiltros();
}

function lev_agregarFiltro() {
  const data = {};
  LEV_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  data['lev-empresa']  = (document.getElementById('lev-empresa')?.value  || '').trim();
  data['lev-contacto'] = (document.getElementById('lev-contacto')?.value || '').trim();
  data['lev-cargo']    = (document.getElementById('lev-cargo')?.value    || '').trim();

  const lista = lev_getFiltros();
  const siguienteNum = lista.length > 0 ? Math.max(...lista.map(f => parseInt(f['lev-filtro']) || 0)) + 1 : 1;
  data['lev-filtro'] = siguienteNum;
  const elFiltro = document.getElementById('lev-filtro');
  if (elFiltro) elFiltro.value = siguienteNum;

  if (!data['lev-nombreFiltro'] && !data['lev-empresa']) {
    toast('Completa al menos el nombre del filtro o la empresa', 'err');
    return;
  }

  data._id = Date.now();
  data.fecha = new Date().toLocaleString('es-CL');
  lista.push(data);
  localStorage.setItem('lev_filtros', JSON.stringify(lista));

  const nextNum = siguienteNum + 1;
  if (elFiltro) elFiltro.value = nextNum;

  lev_renderFiltros();
  toast('＋ Filtro agregado a la lista', 'ok');
}

function lev_renderFiltros() {
  const lista = lev_getFiltros();
  const panel = document.getElementById('lev-filtros-panel');
  const tbody = document.getElementById('lev-filtros-tbody');
  const count = document.getElementById('lev-filtros-count');
  if (!panel) return;
  if (lista.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  if (count) count.textContent = lista.length + ' ficha' + (lista.length !== 1 ? 's' : '');
  if (tbody) tbody.innerHTML = lista.map(f => `
    <tr class="lev-filtro-row">
      <td><span class="lev-num-badge">${f['lev-filtro'] || '—'}</span></td>
      <td><strong>${f['lev-nombreFiltro'] || '—'}</strong></td>
      <td>${f['lev-empresa'] || '—'}</td>
      <td style="text-align:center">${f['lev-medA'] || '—'}</td>
      <td style="text-align:center">${f['lev-medB'] || '—'}</td>
      <td style="text-align:center">${f['lev-medC'] || '—'}</td>
      <td>${f['lev-diametro'] || '—'}</td>
      <td>${f['lev-temperatura'] || '—'}</td>
      <td>${f['lev-material'] || '—'}</td>
      <td style="max-width:150px;white-space:pre-wrap;font-size:11px;color:#607d8b;">${f['lev-observaciones'] || '—'}</td>
      <td style="white-space:nowrap;">
        <button class="lev-btn-cargar" onclick="lev_cargarFiltro(${f._id})">✎ Cargar</button>
        <button class="lev-btn-eliminar" onclick="lev_eliminarFiltro(${f._id})">✕</button>
      </td>
    </tr>
  `).join('');
}

function lev_cargarFiltro(id) {
  const item = lev_getFiltros().find(f => f._id === id);
  if (!item) return;
  LEV_FIELDS.forEach(fid => {
    const el = document.getElementById(fid);
    if (el && item[fid] !== undefined) el.value = item[fid];
  });
  document.querySelector('#s-levantamiento .scroll').scrollTo({ top: 0, behavior: 'smooth' });
}

function lev_eliminarFiltro(id) {
  if (!confirm('¿Eliminar este filtro de la lista?')) return;
  const lista = lev_getFiltros().filter(f => f._id !== id);
  localStorage.setItem('lev_filtros', JSON.stringify(lista));
  lev_renderFiltros();
  toast('🗑 Filtro eliminado', 'err');
}

function lev_guardarVisitaYForm() {
  const lista = lev_getFiltros();
  if (lista.length === 0) {
    toast('Agrega al menos un filtro antes de guardar', 'err');
    return;
  }
  const data = {};
  LEV_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  localStorage.setItem('lev_form', JSON.stringify(data));

  const nVisita = data['lev-visita'] ? String(data['lev-visita']).padStart(3,'0') : '001';
  const visita = {
    numero: nVisita,
    empresa:  data['lev-empresa']  || '',
    contacto: data['lev-contacto'] || '',
    cargo:    data['lev-cargo']    || '',
    fecha:    new Date().toLocaleString('es-CL'),
    filtros:  lista,
    form:     data
  };

  let historial = lev_getVisitas();
  const idx = historial.findIndex(v => v.numero === nVisita);
  if (idx >= 0) historial[idx] = visita;
  else historial.push(visita);
  historial.sort((a,b) => parseInt(b.numero) - parseInt(a.numero));
  localStorage.setItem('lev_historial', JSON.stringify(historial));
  toast('💾 Visita guardada en historial', 'ok');
}

function lev_nuevaVisita() {
  if (!confirm('¿Iniciar una nueva visita? Se limpiarán todos los campos y filtros del formulario actual.')) return;
  localStorage.removeItem('lev_filtros');
  localStorage.removeItem('lev_form');
  LEV_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const historial = lev_getVisitas();
  const siguiente = historial.length > 0
    ? Math.max(...historial.map(v => parseInt(v.numero) || 0)) + 1
    : 1;
  const elVisita = document.getElementById('lev-visita');
  const disp = document.getElementById('lev-visita-display');
  if (elVisita) elVisita.value = siguiente;
  if (disp) disp.textContent = String(siguiente).padStart(3,'0');
  const elFiltro = document.getElementById('lev-filtro');
  if (elFiltro) elFiltro.value = 1;
  lev_renderFiltros();
  document.querySelector('#s-levantamiento .scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  toast('✦ Nueva visita iniciada', 'ok');
}

function lev_abrirHistorial() {
  lev_renderHistorial();
  document.getElementById('lev-pagina-historial').style.display = 'block';
}

function lev_cerrarHistorial() {
  document.getElementById('lev-pagina-historial').style.display = 'none';
}

function lev_renderHistorial() {
  const historial = lev_getVisitas();
  const cont = document.getElementById('lev-historial-lista');
  if (!cont) return;
  if (historial.length === 0) {
    cont.innerHTML = `<div style="text-align:center;padding:48px 20px;color:#607d8b;">
      <div style="font-size:40px;margin-bottom:12px;">📋</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:16px;letter-spacing:1px;">No hay visitas guardadas aún</div>
      <div style="font-size:12px;margin-top:6px;">Presiona <strong>Guardar</strong> para registrar la visita actual</div>
    </div>`;
    return;
  }
  cont.innerHTML = historial.map(v => `
    <div class="lev-visita-card">
      <div class="lev-visita-card-header">
        <div class="lev-visita-num-badge">N° ${v.numero}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:#1a2535;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.empresa || 'Sin empresa'}</div>
          <div style="font-size:11px;color:#607d8b;margin-top:2px;">${v.contacto ? '👤 '+v.contacto : ''} ${v.fecha ? '· 📅 '+v.fecha : ''}</div>
        </div>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;padding:3px 10px;border-radius:10px;background:#2196c4;color:#fff;white-space:nowrap;flex-shrink:0;">${v.filtros?.length||0} filtro${(v.filtros?.length||0)!==1?'s':''}</span>
        <button onclick="lev_verVisita('${v.numero}')" style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;padding:7px 14px;border-radius:5px;border:none;cursor:pointer;background:#2196c4;color:#fff;white-space:nowrap;flex-shrink:0;">👁 Ver</button>
        <button onclick="lev_eliminarVisita('${v.numero}')" style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;padding:7px 10px;border-radius:5px;cursor:pointer;background:transparent;color:#c62828;border:1px solid #e57373;flex-shrink:0;">✕</button>
      </div>
    </div>
  `).join('');
}

let _lev_visitaModal = null;

function lev_verVisita(numero) {
  const historial = lev_getVisitas();
  const v = historial.find(h => h.numero === numero);
  if (!v) return;
  _lev_visitaModal = v;

  const tit = document.getElementById('lev-modal-titulo');
  if (tit) tit.textContent = 'VISITA N° ' + v.numero;

  const filas = (v.filtros || []).map((f,i) => `
    <tr>
      <td style="text-align:center;font-weight:700;color:#fff;background:${i%2===0?'#2196c4':'#1565a0'}">${f['lev-filtro']||i+1}</td>
      <td>${f['lev-nombreFiltro']||'—'}</td>
      <td style="text-align:center">${f['lev-medA']||'—'}</td>
      <td style="text-align:center">${f['lev-medB']||'—'}</td>
      <td style="text-align:center">${f['lev-medC']||'—'}</td>
      <td>${f['lev-diametro']||'—'}</td>
      <td>${f['lev-temperatura']||'—'}</td>
      <td>${f['lev-material']||'—'}</td>
      <td style="font-size:11px;color:#607d8b">${f['lev-observaciones']||'—'}</td>
    </tr>`).join('');

  const body = document.getElementById('lev-modal-body');
  if (body) body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;background:#f0f8ff;border-radius:8px;padding:14px;border:1px solid #cfd8dc;">
      <div style="display:flex;gap:8px;align-items:baseline;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#2196c4;text-transform:uppercase;min-width:70px;">Empresa</span><span style="font-size:13px;color:#1a2535;font-weight:500;">${v.empresa||'—'}</span></div>
      <div style="display:flex;gap:8px;align-items:baseline;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#2196c4;text-transform:uppercase;min-width:70px;">Contacto</span><span style="font-size:13px;color:#1a2535;font-weight:500;">${v.contacto||'—'}</span></div>
      <div style="display:flex;gap:8px;align-items:baseline;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#2196c4;text-transform:uppercase;min-width:70px;">Cargo</span><span style="font-size:13px;color:#1a2535;font-weight:500;">${v.cargo||'—'}</span></div>
      <div style="display:flex;gap:8px;align-items:baseline;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#2196c4;text-transform:uppercase;min-width:70px;">Fecha</span><span style="font-size:13px;color:#1a2535;font-weight:500;">${v.fecha||'—'}</span></div>
    </div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:#2196c4;margin-bottom:8px;">FILTROS REGISTRADOS</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#1565a0;">
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;">N°</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;">Nombre</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">A</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">B</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">C</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">Diám.</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">Temp.</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">Material</th>
          <th style="padding:8px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:11px;">Obs.</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  document.getElementById('lev-modal-visita').style.display = 'block';
}

function lev_cerrarModal() {
  document.getElementById('lev-modal-visita').style.display = 'none';
  _lev_visitaModal = null;
}

function lev_cargarVisitaEnFormulario() {
  if (!_lev_visitaModal) return;
  const v = _lev_visitaModal;
  if (v.form) {
    LEV_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && v.form[id] !== undefined) el.value = v.form[id];
    });
  }
  const disp = document.getElementById('lev-visita-display');
  if (disp) disp.textContent = String(v.numero).padStart(3,'0');
  localStorage.setItem('lev_filtros', JSON.stringify(v.filtros || []));
  localStorage.setItem('lev_form', JSON.stringify(v.form || {}));
  lev_renderFiltros();
  lev_cerrarModal();
  lev_cerrarHistorial();
  document.querySelector('#s-levantamiento .scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function lev_eliminarVisita(numero) {
  if (!confirm('¿Eliminar la Visita N° '+numero+' del historial?')) return;
  let historial = lev_getVisitas().filter(v => v.numero !== numero);
  localStorage.setItem('lev_historial', JSON.stringify(historial));
  lev_renderHistorial();
}

function lev_exportarExcel() {
  if (typeof XLSX === 'undefined') { toast('XLSX no disponible', 'err'); return; }
  const g = id => document.getElementById(id)?.value || '';
  const lista = lev_getFiltros();
  const wb = XLSX.utils.book_new();
  const ws = {};

  const cell = (v, s) => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
  const sTitulo = { font:{bold:true,sz:16,color:{rgb:'FFFFFF'},name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:'1565A0'}}, alignment:{horizontal:'center',vertical:'center'} };
  const sSubtitulo = { font:{bold:false,sz:10,color:{rgb:'FFFFFF'},name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:'2196C4'}}, alignment:{horizontal:'center'} };
  const sEtiqueta = { font:{bold:true,sz:10,color:{rgb:'1565A0'},name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:'DAEEF9'}}, alignment:{horizontal:'left',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'B3D9F0'}},bottom:{style:'thin',color:{rgb:'B3D9F0'}},left:{style:'thin',color:{rgb:'B3D9F0'}},right:{style:'thin',color:{rgb:'B3D9F0'}}} };
  const sValor = { font:{sz:11,name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:'F5FBFF'}}, alignment:{horizontal:'left',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'CFD8DC'}},bottom:{style:'thin',color:{rgb:'CFD8DC'}},left:{style:'thin',color:{rgb:'CFD8DC'}},right:{style:'thin',color:{rgb:'CFD8DC'}}} };
  const sHeader = { font:{bold:true,sz:10,color:{rgb:'FFFFFF'},name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:'1565A0'}}, alignment:{horizontal:'center',vertical:'center',wrapText:true}, border:{top:{style:'thin',color:{rgb:'0D47A1'}},bottom:{style:'medium',color:{rgb:'2196C4'}},left:{style:'thin',color:{rgb:'0D47A1'}},right:{style:'thin',color:{rgb:'0D47A1'}}} };
  const sData = bg => ({ font:{sz:10,name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:bg}}, alignment:{vertical:'center',wrapText:true}, border:{top:{style:'thin',color:{rgb:'CFD8DC'}},bottom:{style:'thin',color:{rgb:'CFD8DC'}},left:{style:'thin',color:{rgb:'CFD8DC'}},right:{style:'thin',color:{rgb:'CFD8DC'}}} });
  const sNum = bg => ({ font:{bold:true,sz:11,color:{rgb:'FFFFFF'},name:'Calibri'}, fill:{patternType:'solid',fgColor:{rgb:bg==='EEF7FC'?'2196C4':'4DB8E8'}}, alignment:{horizontal:'center',vertical:'center'}, border:{top:{style:'thin',color:{rgb:'CFD8DC'}},bottom:{style:'thin',color:{rgb:'CFD8DC'}},left:{style:'thin',color:{rgb:'CFD8DC'}},right:{style:'thin',color:{rgb:'CFD8DC'}}} });

  ws['A1'] = cell('INPAMIND – INSUMOS PARA LA MINERÍA E INDUSTRIA', sTitulo);
  ws['A2'] = cell('Ficha Técnica de Filtros · '+new Date().toLocaleString('es-CL'), sSubtitulo);
  ws['A4'] = cell('VISITA N°', sEtiqueta);
  ws['B4'] = cell(g('lev-visita') ? String(g('lev-visita')).padStart(3,'0') : '—', {...sValor,font:{bold:true,sz:14,color:{rgb:'1565A0'},name:'Calibri'}});
  ws['A5'] = cell('EMPRESA', sEtiqueta);
  ws['B5'] = cell(g('lev-empresa'), sValor);
  ws['A6'] = cell('CONTACTO', sEtiqueta);
  ws['B6'] = cell(g('lev-contacto'), sValor);
  ws['D6'] = cell('CARGO', sEtiqueta);
  ws['E6'] = cell(g('lev-cargo'), sValor);

  const cols = ['N°','Nombre Filtro','A','B','C','Diám. Placa','Temperatura','Material','Observaciones','Fecha'];
  cols.forEach((h,i) => { ws[XLSX.utils.encode_cell({r:7,c:i})] = cell(h, sHeader); });

  const filas = lista.length > 0 ? lista : [{
    'lev-filtro': g('lev-filtro'), 'lev-nombreFiltro': g('lev-nombreFiltro'),
    'lev-medA': g('lev-medA'), 'lev-medB': g('lev-medB'), 'lev-medC': g('lev-medC'),
    'lev-diametro': g('lev-diametro'), 'lev-temperatura': g('lev-temperatura'),
    'lev-material': g('lev-material'), 'lev-observaciones': g('lev-observaciones'),
    fecha: new Date().toLocaleString('es-CL')
  }];

  filas.forEach((f,ri) => {
    const r = ri+8;
    const bg = ri%2===0 ? 'EEF7FC' : 'FFFFFF';
    const rowData = [
      f['lev-filtro']||'', f['lev-nombreFiltro']||'',
      f['lev-medA']||'', f['lev-medB']||'', f['lev-medC']||'',
      f['lev-diametro']||'', f['lev-temperatura']||'', f['lev-material']||'',
      f['lev-observaciones']||'', f.fecha||''
    ];
    rowData.forEach((v,ci) => { ws[XLSX.utils.encode_cell({r,c:ci})] = cell(v, ci===0?sNum(bg):sData(bg)); });
  });

  ws['!ref'] = 'A1:J'+(8+filas.length);
  ws['!cols'] = [{wch:12},{wch:26},{wch:10},{wch:10},{wch:10},{wch:15},{wch:13},{wch:22},{wch:36},{wch:20}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:3,c:1},e:{r:3,c:9}},{s:{r:4,c:1},e:{r:4,c:9}},{s:{r:5,c:1},e:{r:5,c:2}},{s:{r:5,c:4},e:{r:5,c:9}}];

  XLSX.utils.book_append_sheet(wb, ws, 'Ficha Técnica');
  XLSX.writeFile(wb, 'INPAMIND_Fichas_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('📊 Excel exportado', 'ok');
}

function lev_generarInforme() {
  const snapshot = {};
  LEV_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) snapshot[id] = el.value;
  });
  localStorage.setItem('lev_form', JSON.stringify(snapshot));
  const lista = lev_getFiltros();
  if (lista.length === 0) { toast('Agrega al menos un filtro antes de generar el informe', 'err'); return; }
  if (window.JSZip) { lev__buildDocx(lista); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  s.onload = () => lev__buildDocx(lista);
  s.onerror = () => toast('No se pudo cargar JSZip', 'err');
  document.head.appendChild(s);
}

function lev__buildDocx(lista) {
  const saved = JSON.parse(localStorage.getItem('lev_form') || '{}');
  const val = id => { const domVal=(document.getElementById(id)?.value||'').trim(); return domVal||(saved[id]||'').trim(); };
  const empresa  = val('lev-empresa')  || '_______________';
  const contacto = val('lev-contacto') || '_______________';
  const cargo    = val('lev-cargo')    || '_______________';
  const nVisita  = val('lev-visita')   ? String(val('lev-visita')).padStart(3,'0') : '001';
  const nFiltros = lista.length;
  const hoy = new Date().toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'});

  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const rpr = (bold,sz,color,italic) => `<w:rPr>${bold?'<w:b/>':''}${italic?'<w:i/>':''}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>`;
  const run = (txt,bold=false,sz=22,color='37474F',italic=false) => `<w:r>${rpr(bold,sz,color,italic)}<w:t xml:space="preserve">${esc(txt)}</w:t></w:r>`;
  const par = (inner,jc='both',before=0,after=120) => `<w:p><w:pPr><w:jc w:val="${jc}"/><w:spacing w:before="${before*20}" w:after="${after*20}"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:pPr>${inner}</w:p>`;
  const parBorder = (side,color='2196C4') => `<w:p><w:pPr><w:pBdr><w:${side} w:val="single" w:sz="6" w:space="1" w:color="${color}"/></w:pBdr><w:spacing w:before="0" w:after="160"/></w:pPr></w:p>`;
  const tcPr = (fill,w) => `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>`;
  const filaEmp = (label,valor) => `<w:tr><w:tc>${tcPr('DAEEF9',1800)}${par(run(label,true,20,'1565A0'),'left',3,3)}</w:tc><w:tc>${tcPr('FFFFFF',7200)}${par(run(valor,false,20,'37474F'),'left',3,3)}</w:tc></w:tr>`;
  const tblBorders = (color) => `<w:tblBorders>${['top','bottom','left','right','insideH','insideV'].map(s=>`<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${color}"/>`).join('')}</w:tblBorders>`;
  const tablaEmpresa = `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${tblBorders('B3D9F0')}</w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="7200"/></w:tblGrid>${filaEmp('EMPRESA',empresa)}${filaEmp('CONTACTO',contacto)}${filaEmp('CARGO',cargo)}</w:tbl>`;

  const colW=[700,2000,700,700,700,1200,1200,1500,2500];
  const totW=colW.reduce((a,b)=>a+b,0);
  const th=(txt,w)=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="1565A0"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:start w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:end w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${par(run(txt,true,18,'FFFFFF'),'center',0,0)}</w:tc>`;
  const td=(txt,w,fill)=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="40" w:type="dxa"/><w:start w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:end w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${par(run(txt,false,18,'37474F'),'center',0,0)}</w:tc>`;
  const tdN=(txt,w,fill)=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="40" w:type="dxa"/><w:start w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:end w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${par(run(txt,true,18,'FFFFFF'),'center',0,0)}</w:tc>`;
  const headerRow=`<w:tr><w:trPr><w:tblHeader/></w:trPr>${th('N°',colW[0])}${th('Nombre Filtro',colW[1])}${th('A',colW[2])}${th('B',colW[3])}${th('C',colW[4])}${th('Diám. Placa',colW[5])}${th('Temperatura',colW[6])}${th('Material',colW[7])}${th('Observaciones',colW[8])}</w:tr>`;
  const dataRows=lista.map((f,i)=>{const bg=i%2===0?'EEF7FC':'FFFFFF';const nbg=i%2===0?'2196C4':'1565A0';return `<w:tr>${tdN(String(f['lev-filtro']||i+1),colW[0],nbg)}${td(f['lev-nombreFiltro']||'',colW[1],bg)}${td(f['lev-medA']||'',colW[2],bg)}${td(f['lev-medB']||'',colW[3],bg)}${td(f['lev-medC']||'',colW[4],bg)}${td(f['lev-diametro']||'',colW[5],bg)}${td(f['lev-temperatura']||'',colW[6],bg)}${td(f['lev-material']||'',colW[7],bg)}${td(f['lev-observaciones']||'',colW[8],bg)}</w:tr>`;}).join('');
  const grid=colW.map(w=>`<w:gridCol w:w="${w}"/>`).join('');
  const tablaContenedor=`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>${tblBorders('B3D9F0')}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;

  const cuerpo = run('Con fecha ')+run(hoy,true,22,'1565A0')+run(' se llevó a cabo una visita técnica a las instalaciones de ')+run(empresa,true,22,'1565A0')+run(', oportunidad en la que se realizó un levantamiento completo de ')+run(nFiltros+(nFiltros===1?' filtro':' filtros'),true,22,'1565A0')+run('. Durante el desarrollo de la visita contamos con la presencia de don ')+run(contacto,true,22,'1565A0')+run(', ')+run(cargo,true,22,'1565A0')+run(', quien nos acompañó y facilitó el acceso a cada uno de los equipos inspeccionados.');

  const logoB64='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';

  const logoXml=`<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="60"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2200000" cy="430000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2200000" cy="430000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${logoXml}${parBorder('bottom','2196C4')}${par(run('INFORME DE VISITA N° '+nVisita,true,32,'1565A0'),'left',6,6)}${par(run('Fecha: '+hoy,false,20,'607D8B'),'left',0,12)}${tablaEmpresa}${par('','left',0,8)}${par(cuerpo,'both',0,10)}${par(run('A continuación se detallan las medidas tomadas:',true,22,'1565A0'),'left',6,6)}${tablaContenedor}${par('','left',0,10)}${parBorder('top','2196C4')}${par(run('Quedamos a plena disposición para resolver cualquier consulta adicional respecto al levantamiento realizado, y para presentar nuestra propuesta con los productos INPAMIND que mejor se ajusten a los requerimientos técnicos de su planta.'),'both',0,20)}${par(run('Víctor Pardo',true,24,'1565A0'),'left',0,0)}${par(run('Ejecutivo de Ventas Técnicas',false,20,'37474F'),'left',0,0)}${par(run('INPAMIND',true,20,'2196C4'),'left',0,0)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.jpeg"/></Relationships>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const appRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;

  function b64ToUint8(b64){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr;}
  const zip=new JSZip();
  zip.file('[Content_Types].xml',contentTypes);
  zip.folder('_rels').file('.rels',appRels);
  const word=zip.folder('word');
  word.file('document.xml',docXml);
  word.file('styles.xml',styles);
  word.folder('_rels').file('document.xml.rels',rels);
  word.folder('media').file('logo.jpeg',b64ToUint8(logoB64));
  zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}).then(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='INPAMIND_Informe_Visita_'+nVisita+'.docx';
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('📄 Informe Word generado', 'ok');
  });
}

// ── Levantamiento: Autocomplete empresa ──
function lev_handleEmpresaSearch() {
  const q = document.getElementById('lev-empresa').value.toLowerCase().trim();
  const listEl = document.getElementById('lev-empresa-list');
  if (!q) { listEl.style.display = 'none'; return; }

  const matches = knownClients.filter(c => c.cliente.toLowerCase().includes(q));
  if (!matches.length) { listEl.style.display = 'none'; return; }

  const esc = s => String(s||'').replace(/'/g,"\\'");
  listEl.innerHTML = matches.slice(0,8).map(c => `
    <div class="ac-item" onclick="lev_selectEmpresa('${esc(c.cliente)}')">
      <ion-icon name="business"></ion-icon>
      <div>
        <div style="font-weight:600">${c.cliente}</div>
        ${c.contacto ? `<div style="font-size:11px;color:var(--t50)">${c.contacto}${c.cargo ? ' · '+c.cargo : ''}</div>` : ''}
      </div>
    </div>
  `).join('');
  listEl.style.display = 'flex';
}

function lev_selectEmpresa(nombre) {
  const c = knownClients.find(x => x.cliente === nombre);
  if (c) {
    const emp = docu
