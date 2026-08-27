/* ========================================
   NutriMap — App Principal
   ======================================== */

const map = L.map('map').setView([19.4326, -99.1332], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

/* ---------- Sidebar responsive ---------- */

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarLoading = document.getElementById('sidebar-loading');
const sidebarError = document.getElementById('sidebar-error');
const sidebarErrorMsg = document.getElementById('sidebar-error-msg');
const sidebarRetryBtn = document.getElementById('sidebar-retry-btn');
const mapEl = document.getElementById('map');

function isMobile() {
  return window.innerWidth < 768;
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarToggle.setAttribute('aria-expanded', 'true');
  if (!isMobile()) {
    mapEl.classList.add('sidebar-open');
  }
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarToggle.setAttribute('aria-expanded', 'false');
  mapEl.classList.remove('sidebar-open');
}

function toggleSidebar() {
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

sidebarToggle.addEventListener('click', toggleSidebar);

sidebar.addEventListener('click', function (e) {
  if (e.target === sidebar && isMobile()) {
    closeSidebar();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && sidebar.classList.contains('open') && isMobile()) {
    closeSidebar();
  }
});

const mql = window.matchMedia('(min-width: 768px)');
mql.addEventListener('change', function (e) {
  if (e.matches) {
    sidebar.classList.add('open');
    mapEl.classList.add('sidebar-open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
  } else {
    sidebar.classList.remove('open');
    mapEl.classList.remove('sidebar-open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
  }
});

if (!isMobile()) {
  sidebar.classList.add('open');
  mapEl.classList.add('sidebar-open');
}

/* ---------- Sidebar loading / error ---------- */

function showSidebarLoading() {
  sidebarLoading.style.display = 'flex';
  sidebarError.style.display = 'none';
}

function hideSidebarLoading() {
  sidebarLoading.style.display = 'none';
}

function showSidebarError(msg) {
  sidebarErrorMsg.textContent = msg;
  sidebarError.style.display = 'flex';
  sidebarLoading.style.display = 'none';
}

function hideSidebarError() {
  sidebarError.style.display = 'none';
}

sidebarRetryBtn.addEventListener('click', function () {
  hideSidebarError();
  loadMarkers(map).then(function (layer) {
    if (layer) initSearch(map, layer);
  });
});

/* ---------- Init ---------- */

addHeatmapToggle(map);
showSidebarLoading();

loadMarkers(map).then(function (layer) {
  hideSidebarLoading();
  if (layer) initSearch(map, layer);
}).catch(function () {
  hideSidebarLoading();
  showSidebarError('No pudimos cargar los establecimientos. Intenta de nuevo.');
});
