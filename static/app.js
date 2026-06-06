// ── STATE ────────────────────────────────────────────────────────────────────
let activeProfile = '';
let activeVendu   = '';
let lastList      = [];   // liste courante pour le tri côté client
let modalCoupon   = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadCoupons();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  setupSwipeClose();
});

// ── DEBOUNCE ─────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const debouncedLoad = debounce(loadCoupons, 300);

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
function handleFileInput(e) {
  const f = e.target.files[0];
  if (f) uploadPDF(f);
  e.target.value = '';
}
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
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
    if (!res.ok) { toast(data.error || 'Erreur import', 'error'); return; }
    toast(`${data.added} coupon(s) importé(s)${data.skipped ? ` · ${data.skipped} doublon(s)` : ''}`);
    await loadStats();
    await loadCoupons();
    showMain();
  } catch(e) {
    toast('Erreur réseau : ' + e.message, 'error');
  } finally {
    document.getElementById('loadingDiv').style.display = 'none';
  }
}

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
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

  animateValue('sTotal',    data.total);
  animateValue('sRestants', data.restants);
  animateValue('sVendus',   data.vendus);
  document.getElementById('sMontant').textContent =
    Number(data.montant_restant).toLocaleString('fr-FR') + ' F';
  document.getElementById('progressText').textContent = `${data.vendus} / ${data.total}`;
  document.getElementById('progressFill').style.width =
    data.total ? (data.vendus / data.total * 100).toFixed(1) + '%' : '0%';

  buildProfileTabs(data.by_profile);
  updateFilterCounts(data);
  checkEmpty(data.total);
}

function animateValue(id, target) {
  const el = document.getElementById(id);
  el.textContent = target;
}

// ── ONGLETS PROFILS ───────────────────────────────────────────────────────────
function buildProfileTabs(profiles) {
  const all = [{
    forfait: '',
    total: profiles.reduce((s, p) => s + p.total, 0),
    vendus: profiles.reduce((s, p) => s + p.vendus, 0),
    montant_restant: profiles.reduce((s, p) => s + p.montant_restant, 0),
  }, ...profiles];

  document.getElementById('profileTabs').innerHTML = all.map(p => {
    const restants = p.total - p.vendus;
    return `
      <button class="ptab ${p.forfait === activeProfile ? 'active' : ''}"
              data-forfait="${p.forfait}"
              onclick="switchProfile('${p.forfait}', this)">
        ${p.forfait === '' ? 'Tous' : 'Forfait ' + p.forfait}
        <span style="font-weight:400;opacity:.55;font-size:11px;margin-left:3px">(${restants})</span>
      </button>`;
  }).join('');

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
  fetch('/api/stats').then(r => r.json()).then(data => {
    const all = [{ forfait: '', total: 0, vendus: 0, montant_restant: 0 }, ...data.by_profile];
    all[0].total           = data.by_profile.reduce((s, p) => s + p.total, 0);
    all[0].vendus          = data.by_profile.reduce((s, p) => s + p.vendus, 0);
    all[0].montant_restant = data.by_profile.reduce((s, p) => s + p.montant_restant, 0);
    updateProfileStats(all.find(p => p.forfait === forfait) || all[0]);
  });
}

// ── FILTER COUNTS ─────────────────────────────────────────────────────────────
function updateFilterCounts(stats) {
  const tabs = document.getElementById('filterTabs');
  if (!tabs) return;
  tabs.querySelectorAll('.ftab').forEach(btn => {
    const v = btn.dataset.vendu;
    let count = '';
    if (v === '')  count = stats.total;
    if (v === '0') count = stats.restants;
    if (v === '1') count = stats.vendus;
    btn.textContent = (v === '' ? 'Tous' : v === '0' ? 'Restants' : 'Vendus') + ` (${count})`;
  });
}

// ── COUPONS ───────────────────────────────────────────────────────────────────
async function loadCoupons() {
  showSkeleton();
  const q = document.getElementById('searchInput')?.value.trim() || '';
  const params = new URLSearchParams();
  if (activeProfile) params.set('forfait', activeProfile);
  if (activeVendu !== '') params.set('vendu', activeVendu);
  if (q) params.set('q', q);
  const res  = await fetch('/api/coupons?' + params);
  lastList   = await res.json();
  applySortAndRender();
}

function showSkeleton() {
  const grid = document.getElementById('couponGrid');
  document.getElementById('emptyState').style.display = 'none';
  grid.innerHTML = Array(6).fill(`
    <div class="skeleton-card">
      <div class="skel skel-row" style="width:80%;margin-bottom:12px"></div>
      <div class="skel skel-code"></div>
      <div class="skel skel-meta" style="margin-top:8px"></div>
      <div class="skel skel-price" style="margin-top:10px"></div>
    </div>
  `).join('');
}

// ── SORT ──────────────────────────────────────────────────────────────────────
function applySortAndRender() {
  const sort = document.getElementById('sortSelect')?.value || 'default';
  let list = [...lastList];

  if (sort === 'code')        list.sort((a,b) => a.username.localeCompare(b.username));
  else if (sort === 'price_asc')  list.sort((a,b) => a.prix - b.prix);
  else if (sort === 'price_desc') list.sort((a,b) => b.prix - a.prix);
  else if (sort === 'date_desc')  list.sort((a,b) => {
    if (!a.date_vente && !b.date_vente) return 0;
    if (!a.date_vente) return 1;
    if (!b.date_vente) return -1;
    return b.date_vente.localeCompare(a.date_vente);
  });

  renderGrid(list);
}

// ── RENDER GRID ────────────────────────────────────────────────────────────────
function renderGrid(list) {
  const grid  = document.getElementById('couponGrid');
  const empty = document.getElementById('emptyState');

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map((c, i) => `
    <div class="coupon-card ${c.vendu ? 'vendu' : ''}"
         style="animation-delay:${Math.min(i * 20, 200)}ms"
         onclick='openModal(${JSON.stringify(c)})'>
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

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(coupon) {
  modalCoupon = coupon;

  document.getElementById('mForfait').textContent = coupon.forfait;
  document.getElementById('mCode').textContent = coupon.username;
  document.getElementById('mPassword').innerHTML =
    `Mot de passe : <span>${coupon.password}</span>`;

  const statusEl = document.getElementById('mStatus');
  statusEl.textContent = coupon.vendu ? 'VENDU' : 'DISPO';
  statusEl.className = 'status-pill ' + (coupon.vendu ? 'vendu' : 'dispo');

  document.getElementById('mDetails').innerHTML = `
    <div class="minfo-item">
      <div class="minfo-label">Durée</div>
      <div class="minfo-value">${coupon.temps}</div>
    </div>
    <div class="minfo-item">
      <div class="minfo-label">Validité</div>
      <div class="minfo-value">${coupon.validite}</div>
    </div>
    <div class="minfo-item">
      <div class="minfo-label">Prix</div>
      <div class="minfo-value price">${Number(coupon.prix).toLocaleString('fr-FR')} F</div>
    </div>
  `;

  const dateWrap = document.getElementById('mDateWrap');
  if (coupon.vendu && coupon.date_vente) {
    document.getElementById('mDate').textContent = coupon.date_vente;
    dateWrap.style.display = 'flex';
  } else {
    dateWrap.style.display = 'none';
  }

  const btnSell = document.getElementById('btnSell');
  if (coupon.vendu) {
    btnSell.textContent = 'Annuler la vente';
    btnSell.className = 'btn btn-sell action-undo';
  } else {
    btnSell.textContent = 'Marquer comme vendu';
    btnSell.className = 'btn btn-sell action-sell';
  }

  // Reset copy button
  const btnCopy = document.getElementById('btnCopy');
  btnCopy.classList.remove('copied');
  document.getElementById('btnCopyText').textContent = 'Copier le code';

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  modalCoupon = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

async function confirmToggle() {
  if (!modalCoupon) return;
  const newVendu = !modalCoupon.vendu;
  const res = await fetch(`/api/coupons/${modalCoupon.id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ vendu: newVendu }),
  });
  if (!res.ok) return;
  closeModal();
  toast(newVendu ? `Coupon ${modalCoupon.username} marqué vendu` : `Vente annulée — ${modalCoupon.username}`);
  await loadStats();
  await loadCoupons();
}

async function copyCode() {
  if (!modalCoupon) return;
  try {
    await navigator.clipboard.writeText(modalCoupon.username);
    const btn = document.getElementById('btnCopy');
    btn.classList.add('copied');
    document.getElementById('btnCopyText').textContent = 'Copié !';
    setTimeout(() => {
      btn.classList.remove('copied');
      document.getElementById('btnCopyText').textContent = 'Copier le code';
    }, 1800);
  } catch {
    toast('Copie non supportée sur ce navigateur', 'error');
  }
}

// ── SWIPE DOWN TO CLOSE (mobile) ──────────────────────────────────────────────
function setupSwipeClose() {
  const sheet = document.getElementById('modalSheet');
  let startY = 0;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove',  e => {
    if (e.touches[0].clientY - startY > 90) closeModal();
  }, { passive: true });
}

// ── FILTER & SORT ─────────────────────────────────────────────────────────────
function setFilter(vendu, el) {
  activeVendu = vendu;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadCoupons();
}

// ── ACTIONS GLOBALES ─────────────────────────────────────────────────────────
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
  toast('Tous les coupons supprimés');
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
