// ── INPAMIND App — Frontend Logic ──
const API = window.location.origin;
let token = localStorage.getItem('inpamind_token');
let currentUser = null;
let currentVisitId = null;
let newPhotoData = null;
let editPhotoData = null;
let editPhotoChanged = false;
let navHistory = [];

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
  if (el) el.classList.add('active');
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

async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass = document.getElementById('r-pass').value;
  if (!name || !email || !pass) return toast('Completa todos los campos', 'err');
  if (pass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'err');
  const btn = document.getElementById('btnRegister');
  btn.disabled = true;
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: { name, email, password: pass } });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('inpamind_token', token);
    enterApp();
    toast('Cuenta creada ✅', 'ok');
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
  initTabs();
  initNewForm();
  if (currentUser.role === 'admin') {
    switchTab(3);
    loadAdminStats();
  } else {
    switchTab(0);
  }
}

// ── Tabs ──
function initTabs() {
  const baseTabs = [
    { icon: 'home', label: 'Inicio', screen: 's-home' },
    { icon: 'add-circle', label: 'Nueva', screen: 's-nueva' },
    { icon: 'list', label: 'Historial', screen: 's-hist' }
  ];
  const adminTab = { icon: 'shield-checkmark', label: 'Admin', screen: 's-admin' };
  const tabs = currentUser?.role === 'admin' ? [...baseTabs, adminTab] : baseTabs;
  const ids = ['tabBar', 'tabBar2', 'tabBar3', 'tabBar4'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = tabs.map((t, i) => `<button class="tab-btn" onclick="switchTab(${i})"><ion-icon name="${t.icon}"></ion-icon>${t.label}</button>`).join('');
  });
}

function switchTab(i) {
  const baseSc = ['s-home', 's-nueva', 's-hist'];
  const screens = currentUser?.role === 'admin' ? [...baseSc, 's-admin'] : baseSc;
  if (i >= screens.length) return;
  showScreen(screens[i]);
  navHistory = [];
  document.querySelectorAll('.tab-btn').forEach((b, j) => {
    b.classList.toggle('active', j % screens.length === i);
  });
  if (screens[i] === 's-hist') renderHistory();
  if (screens[i] === 's-nueva') initNewForm();
  if (screens[i] === 's-admin') { loadAdminStats(); loadAdminVisits(); }
}

// ── New Visit Form ──
function initNewForm() {
  const now = new Date();
  document.getElementById('n-fecha').value = now.toISOString().split('T')[0];
  document.getElementById('n-hora').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('n-cliente').value = '';
  document.getElementById('n-dir').value = '';
  document.getElementById('n-contacto').value = '';
  document.getElementById('n-desc').value = '';
  removeNewPhoto();
}

function handleNewPhoto(e) {
  const f = e.target.files[0]; if (!f) return;
  compressImage(f, (dataUrl) => {
    newPhotoData = dataUrl;
    document.getElementById('n-photo-img').src = newPhotoData;
    document.getElementById('n-photo-preview').style.display = 'block';
    document.getElementById('n-photo-btns').style.display = 'none';
  });
}

function removeNewPhoto() {
  newPhotoData = null;
  document.getElementById('n-photo-preview').style.display = 'none';
  document.getElementById('n-photo-btns').style.display = 'flex';
}

async function saveNewVisit() {
  const cliente = document.getElementById('n-cliente').value.trim();
  const dir = document.getElementById('n-dir').value.trim();
  if (!cliente) return toast('El campo Cliente es obligatorio', 'err');
  if (!dir) return toast('El campo Dirección es obligatorio', 'err');
  const btn = document.getElementById('btnSaveNew');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px"></div> Guardando...';
  try {
    const body = {
      fecha: document.getElementById('n-fecha').value,
      hora: document.getElementById('n-hora').value,
      cliente, direccion: dir,
      contacto: document.getElementById('n-contacto').value.trim(),
      descripcion: document.getElementById('n-desc').value.trim()
    };
    if (newPhotoData) body.foto_base64 = newPhotoData;
    await api('/api/visits', { method: 'POST', body });
    toast('✓ Visita guardada correctamente', 'ok');
    initNewForm();
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
  btn.innerHTML = '<ion-icon name="cloud-upload-outline" style="font-size:20px"></ion-icon>GUARDAR VISITA';
}

// ── History ──
async function renderHistory() {
  const search = document.getElementById('h-search').value || '';
  try {
    const data = await api(`/api/visits?search=${encodeURIComponent(search)}`);
    const visits = data.visits || [];
    const clients = new Set(visits.map(v => v.cliente));
    document.getElementById('st-total').textContent = visits.length + ' visitas';
    document.getElementById('st-clients').textContent = clients.size + ' clientes';
    const el = document.getElementById('h-list');
    if (!visits.length) {
      el.innerHTML = '<div class="empty"><ion-icon name="file-tray-outline"></ion-icon><p>No hay visitas registradas</p><p style="font-size:12px;margin-top:8px">Crea tu primera visita con el botón +</p></div>';
      return;
    }
    el.innerHTML = visits.map(v => visitCardHTML(v, false)).join('');
  } catch (e) {
    toast('Error al cargar historial', 'err');
  }
}

function visitCardHTML(v, showSeller) {
  return `<div class="v-card" onclick="showDetail('${v.id}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1"><div class="client"><ion-icon name="business" style="font-size:14px;color:var(--cyan)"></ion-icon>${esc(v.cliente)}</div>
      ${showSeller && v.seller_name ? `<div class="seller-tag" style="margin-top:4px"><ion-icon name="person" style="font-size:10px"></ion-icon>${esc(v.seller_name)}</div>` : ''}
      <div class="meta"><ion-icon name="calendar-outline" style="font-size:11px"></ion-icon>${fmtDate(v.fecha)}<ion-icon name="time-outline" style="font-size:11px"></ion-icon>${esc(v.hora || '—')}</div></div>
      ${v.foto_url ? '<div class="photo-ind"><ion-icon name="camera" style="font-size:12px"></ion-icon>📷</div>' : ''}
    </div>
    ${v.direccion ? `<div class="detail"><ion-icon name="location-outline" style="font-size:12px"></ion-icon>${esc(v.direccion)}</div>` : ''}
    ${v.contacto ? `<div class="detail"><ion-icon name="call-outline" style="font-size:12px"></ion-icon>${esc(v.contacto)}</div>` : ''}
    ${v.descripcion ? `<div class="desc-box">${esc(v.descripcion)}</div>` : ''}
    <div class="actions">
      <button class="btn-sm btn-edit" onclick="event.stopPropagation();editVisit('${v.id}')"><ion-icon name="create-outline" style="font-size:14px"></ion-icon>Editar</button>
      <button class="btn-sm btn-del" onclick="event.stopPropagation();deleteVisit('${v.id}')"><ion-icon name="trash-outline" style="font-size:14px"></ion-icon>Eliminar</button>
    </div></div>`;
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
      <div class="det-item"><ion-icon name="time-outline"></ion-icon><div><div class="lbl2">Hora</div><div class="val">${esc(v.hora || '—')}</div></div></div>
      <div class="det-item"><ion-icon name="location-outline"></ion-icon><div><div class="lbl2">Dirección</div><div class="val">${esc(v.direccion || '—')}</div></div></div>
      <div class="det-item"><ion-icon name="call-outline"></ion-icon><div><div class="lbl2">Contacto</div><div class="val">${esc(v.contacto || '—')}</div></div></div>
      ${v.descripcion ? `<div style="margin-top:8px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><ion-icon name="document-text" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Descripción</span></div>
        <div class="desc-box" style="-webkit-line-clamp:unset">${esc(v.descripcion)}</div></div>` : ''}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:var(--t50)">
        Creado: ${v.created_at ? new Date(v.created_at).toLocaleString('es-CL') : '—'} · Editado: ${v.updated_at ? new Date(v.updated_at).toLocaleString('es-CL') : '—'}
      </div>
    </div>
    ${photoSrc ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><ion-icon name="camera" style="font-size:14px;color:var(--cyan)"></ion-icon><span style="font-size:12px;color:var(--t70);font-weight:600">Foto de la Visita</span></div><img src="${photoSrc}" class="det-photo" onclick="openModal(this.src)"></div>` : ''}
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
      <div class="row" style="margin-bottom:14px"><div><label class="lbl">Fecha</label><input class="inp inp-simple" type="date" id="e-fecha" value="${v.fecha}"></div><div><label class="lbl">Hora</label><input class="inp inp-simple" type="time" id="e-hora" value="${v.hora || ''}"></div></div>
      <div style="margin-bottom:14px"><label class="lbl">Cliente *</label><input class="inp inp-simple" id="e-cliente" value="${esc(v.cliente)}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Dirección *</label><input class="inp inp-simple" id="e-dir" value="${esc(v.direccion || '')}"></div>
      <div style="margin-bottom:14px"><label class="lbl">Contacto</label><input class="inp inp-simple" id="e-contacto" value="${esc(v.contacto || '')}"></div>
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
      hora: document.getElementById('e-hora').value,
      cliente, direccion: dir,
      contacto: document.getElementById('e-contacto').value.trim(),
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
    else if (active === 's-admin') loadAdminVisits();
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

// ── Admin Functions ──
async function loadAdminStats() {
  try {
    const data = await api('/api/admin/stats');
    document.getElementById('admin-stats').innerHTML = `
      <div class="stat-card"><div class="stat-num">${data.totalVisits}</div><div class="stat-lbl">Total Visitas</div></div>
      <div class="stat-card"><div class="stat-num">${data.activeSellers}</div><div class="stat-lbl">Vendedores Activos</div></div>
      <div class="stat-card amber"><div class="stat-num">${data.monthVisits}</div><div class="stat-lbl">Visitas del Mes</div></div>
      <div class="stat-card"><div class="stat-num">${data.withPhoto}</div><div class="stat-lbl">Con Foto</div></div>`;
    // Populate seller filter
    const sel = document.getElementById('a-seller-filter');
    const current = sel.value;
    sel.innerHTML = '<option value="">Todos los vendedores</option>' +
      (data.perSeller || []).map(s => `<option value="${s.email}">${s.name} (${s.visit_count})</option>`).join('');
    sel.value = current;
  } catch (e) { console.error(e); }
}

async function loadAdminVisits() {
  try {
    const seller = document.getElementById('a-seller-filter')?.value || '';
    const search = document.getElementById('a-search')?.value || '';
    const from = document.getElementById('a-from')?.value || '';
    const to = document.getElementById('a-to')?.value || '';
    let q = '/api/admin/visits?';
    if (seller) q += `seller=${encodeURIComponent(seller)}&`;
    if (search) q += `search=${encodeURIComponent(search)}&`;
    if (from) q += `from=${from}&`;
    if (to) q += `to=${to}&`;
    const data = await api(q);
    const el = document.getElementById('a-list');
    if (!(data.visits || []).length) {
      el.innerHTML = '<div class="empty"><ion-icon name="file-tray-outline"></ion-icon><p>No hay visitas</p></div>';
      return;
    }
    el.innerHTML = `<p style="font-size:11px;color:var(--t50);margin-bottom:8px">${data.total} visita(s)</p>` +
      data.visits.map(v => visitCardHTML(v, true)).join('');
  } catch (e) { toast('Error al cargar visitas admin', 'err'); }
}

async function showAdminSellers() {
  navHistory.push('s-admin');
  try {
    const data = await api('/api/admin/sellers');
    const el = document.getElementById('sellers-list');
    el.innerHTML = (data.sellers || []).map(s => `
      <div class="seller-card">
        <ion-icon name="person-circle" style="font-size:36px;color:${s.active ? 'var(--cyan)' : 'var(--danger)'}"></ion-icon>
        <div class="seller-info">
          <div class="seller-name">${esc(s.name)}</div>
          <div class="seller-email">${esc(s.email)}</div>
          <div class="seller-count">${s.visit_count} visitas · ${s.active ? '✅ Activo' : '🚫 Inactivo'}</div>
        </div>
        <button class="toggle-btn ${s.active ? 'toggle-active' : 'toggle-inactive'}" onclick="toggleSeller('${s.id}')">
          ${s.active ? 'Desactivar' : 'Activar'}
        </button>
      </div>`).join('');
    showScreen('s-sellers');
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleSeller(id) {
  try {
    const data = await api(`/api/admin/sellers/${id}`, { method: 'PUT' });
    toast(data.message, 'ok');
    showAdminSellers();
  } catch (e) { toast(e.message, 'err'); }
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

// ── Init ──
window.onload = async function () {
  if (token) {
    try {
      const data = await api('/api/auth/me');
      currentUser = data.user;
      enterApp();
    } catch (e) {
      token = null;
      localStorage.removeItem('inpamind_token');
      showScreen('s-login');
    }
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
