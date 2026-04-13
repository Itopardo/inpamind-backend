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
  else switchTab(2);
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
      <button class="btn-glass" onclick="switchTab(2)"><ion-icon name="time-outline" style="font-size:20px"></ion-icon>HISTORIAL DE VISITAS</button>
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
    { icon: 'list', label: 'Historial', screen: 's-hist' }
  ];
  const adminTabs = [
    { icon: 'home', label: 'Inicio', screen: 's-home' },
    { icon: 'list', label: 'Historial', screen: 's-hist' },
    { icon: 'shield-checkmark', label: 'Admin', screen: 's-admin' }
  ];
  const tabs = currentUser?.role === 'admin' ? adminTabs : vendedorTabs;
  const ids = ['tabBar', 'tabBar2', 'tabBar3', 'tabBar4'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = tabs.map((t, i) => `<button class="tab-btn" onclick="switchTab(${i})"><ion-icon name="${t.icon}"></ion-icon>${t.label}</button>`).join('');
  });
}

function switchTab(i) {
  const vendedorSc = ['s-home', 's-nueva', 's-hist'];
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
    const body = {
      fecha: document.getElementById('n-fecha').value,
      hora: document.getElementById('n-hora-ingreso').value, // Legacy field binding
      hora_salida: hSalida,
      cliente, 
      direccion: dir,
      contacto,
      cargo,
      telefono: document.getElementById('n-telefono').value.trim(),
      mail: document.getElementById('n-mail').value.trim(),
      descripcion: document.getElementById('n-desc').value.trim()
    };
    if (fotoIngresoData) body.foto_base64 = fotoIngresoData;
    if (fotoAdicionalData) body.foto_adicional_base64 = fotoAdicionalData;

    await api('/api/visits', { method: 'POST', body });
    toast('✓ Visita guardada correctamente', 'ok');
    
    // Reset and immediately redirect to History
    initNewForm();
    switchTab(2); 

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
    const photoSrc = v.foto_url ? `${API}${v.foto_url}` : '';
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
    ${v.foto_adicional_url ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><ion-icon name="images" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Foto Adicional</span></div><img src="${API}${v.foto_adicional_url}" class="det-photo" onclick="openModal(this.src)"></div>` : ''}
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
    editPhotoData = v.foto_url ? `${API}${v.foto_url}` : null;
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
    const body = {
      fecha: document.getElementById('e-fecha').value,
      hora: document.getElementById('e-hora-ingreso').value,
      hora_salida: document.getElementById('e-hora-salida').value.trim(),
      cliente, direccion: dir,
      contacto: document.getElementById('e-contacto').value.trim(),
      cargo: document.getElementById('e-cargo').value.trim(),
      telefono: document.getElementById('e-telefono').value.trim(),
      mail: document.getElementById('e-mail').value.trim(),
      descripcion: document.getElementById('e-desc').value.trim()
    };
    if (editPhotoChanged) {
      if (!editPhotoData) body.remove_photo = 'true';
      else if (editPhotoData.startsWith('data:')) body.foto_base64 = editPhotoData;
    }
    const endpoint = currentUser.role === 'admin' ? `/api/admin/visits/${id}` : `/api/visits/${id}`;
    await api(endpoint, { method: 'PUT', body });
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
