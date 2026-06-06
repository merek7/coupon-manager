// ── STATE ────────────────────────────────────────────────────────────────────
let activeProfile = '';   // '' = tous
let activeVendu   = '';   // '' | '0' | '1'

// ── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadCoupons();
});

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
function handleFileInput(e) {
  const f = e.target.files[0];
  if (f) uploadPDF(f);
  e.target.value = '';
}

function onDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) uploadPDF(f);
}

async function uploadPDF(file) {
  document.getElementById('loadingDiv').style.display = 'block';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res  = await fetch('/api/import', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Erreur lors de l\'import', 'error');
      return;
    }

    toast(`${data.added} coupon(s) importé(s)${data.skipped ? ` · ${data.skipped} doublon(s) ignoré(s)` : ''}`);
    await loadStats();
    await loadCoupons();
    showMain();

  } catch(e) {
    toast('Erreur réseau : ' + e.message, 'error');
  } finally {
    document.getElementById('loadingDiv').style.display = 'none';
  }
}

// ── SHOW/HIDE ─────────────────────────────────────────────────────────────────
function showMain() {
  document.getElementById('uploadZone').classList.add('hidden');
  document.getElementById('mainContent').style.display = 'block';
}

function checkEmpty(total) {
  if (total === 0) {
    document.getElementById('uploadZone').classList.remove('hidden');
    document.getElementById('mainContent').style.display = 'none';
  } else {
    showMain();
  }
}

// ── STATS ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  const res  = await fetch('/api/stats');
  const data = await res.json();

  document.getElementById('sTotal').textContent    = data.total;
  document.getElementById('sRestants').textContent = data.restants;
  document.getElementById('sVendus').textContent   = data.vendus;
  document.getElementById('sMontant').textContent  =
    Number(data.montant_restant).toLocaleString('fr-FR') + ' F';
  document.getElementById('progressText').textContent =
    `${data.vendus} / ${data.total}`;
  document.getElementById('progressFill').style.width =
    data.total ? (data.vendus / data.total * 100).toFixed(1) + '%' : '0%';

  buildProfileTabs(data.by_profile);
  checkEmpty(data.total);
}

// ── ONGLETS PROFILS ───────────────────────────────────────────────────────────
function buildProfileTabs(profiles) {
  const tabs = document.getElementById('profileTabs');
  const all  = [{ forfait: '', total: 0, vendus: 0, montant_restant: 0 }, ...profiles];

  // Recalcul du total "Tous"
  all[0].total           = profiles.reduce((s, p) => s + p.total, 0);
  all[0].vendus          = profiles.reduce((s, p) => s + p.vendus, 0);
  all[0].montant_restant = profiles.reduce((s, p) => s + p.montant_restant, 0);

  tabs.innerHTML = all.map(p => `
    <button class="ptab ${p.forfait === activeProfile ? 'active' : ''}"
            data-forfait="${p.forfait}"
            onclick="switchProfile('${p.forfait}', this)">
      ${p.forfait === '' ? 'Tous' : 'Forfait ' + p.forfait}
      <span style="font-weight:400;opacity:.6;margin-left:4px">(${p.total - p.vendus})</span>
    </button>
  `).join('');

  updateProfileStats(all.find(p => p.forfait === activeProfile) || all[0]);
}

function updateProfileStats(p) {
  const restants = p.total - p.vendus;
  document.getElementById('profileStats').innerHTML = `
    <div class="pstat"><span class="dot dot-green"></span>Restants : <strong>${restants}</strong></div>
    <div class="pstat"><span class="dot dot-red"></span>Vendus : <strong>${p.vendus}</strong></div>
    <div class="pstat"><span class="dot dot-orange"></span>Montant restant : <strong>${Number(p.montant_restant).toLocaleString('fr-FR')} FCFA</strong></div>
  `;
}

function switchProfile(forfait, el) {
  activeProfile = forfait;
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadCoupons();

  // Mettre à jour stats du profil sélectionné
  const tabs   = document.getElementById('profileTabs');
  const active = [...tabs.querySelectorAll('.ptab')].find(t => t.dataset.forfait === forfait);
  // Stats via loadStats pour fraîcheur
  fetch('/api/stats').then(r => r.json()).then(data => {
    const profiles = [{ forfait: '', total: 0, vendus: 0, montant_restant: 0 }, ...data.by_profile];
    profiles[0].total           = data.by_profile.reduce((s, p) => s + p.total, 0);
    profiles[0].vendus          = data.by_profile.reduce((s, p) => s + p.vendus, 0);
    profiles[0].montant_restant = data.by_profile.reduce((s, p) => s + p.montant_restant, 0);
    updateProfileStats(profiles.find(p => p.forfait === forfait) || profiles[0]);
  });
}

// ── COUPONS ───────────────────────────────────────────────────────────────────
async function loadCoupons() {
  const q = document.getElementById('searchInput')?.value.trim() || '';

  const params = new URLSearchParams();
  if (activeProfile) params.set('forfait', activeProfile);
  if (activeVendu   !== '') params.set('vendu', activeVendu);
  if (q)            params.set('q', q);

  const res   = await fetch('/api/coupons?' + params);
  const list  = await res.json();

  renderGrid(list);
}

function renderGrid(list) {
  const grid  = document.getElementById('couponGrid');
  const empty = document.getElementById('emptyState');

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map(c => `
    <div class="coupon-card ${c.vendu ? 'vendu' : ''}"
         onclick="toggleVendu('${c.id}', ${c.vendu ? 0 : 1})">
      <div class="card-top">
        <span class="forfait-pill">${c.forfait}</span>
        <span class="status-pill ${c.vendu ? 'vendu' : 'dispo'}">
          ${c.vendu ? 'VENDU' : 'DISPO'}
        </span>
      </div>
      <div class="card-code">${c.username}</div>
      <div class="card-meta">${c.temps} actif · validité ${c.validite}</div>
      <div class="card-price">${Number(c.prix).toLocaleString('fr-FR')} FCFA</div>
      ${c.vendu && c.date_vente
        ? `<div class="card-date">Vendu le ${c.date_vente}</div>`
        : ''}
    </div>
  `).join('');
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────
async function toggleVendu(id, newVendu) {
  const res = await fetch(`/api/coupons/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ vendu: !!newVendu }),
  });
  if (!res.ok) return;
  await loadStats();
  await loadCoupons();
}

function setFilter(vendu, el) {
  activeVendu = vendu;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadCoupons();
}

async function clearAll() {
  const res  = await fetch('/api/stats');
  const data = await res.json();
  if (!data.total) return;
  if (!confirm(`Supprimer tous les ${data.total} coupons ?\nCette action est irréversible.`)) return;

  await fetch('/api/coupons', { method: 'DELETE' });
  activeProfile = '';
  activeVendu   = '';
  await loadStats();
  await loadCoupons();
  toast('Tous les coupons ont été supprimés');
}

function exportRestants() {
  const params = new URLSearchParams({ vendu: '0' });
  if (activeProfile) params.set('forfait', activeProfile);
  window.location.href = '/api/export?' + params;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'error' ? '#dc2626' : '#1e293b';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
