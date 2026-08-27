/* ========================================
   NutriMap — App Principal
   ======================================== */

const map = L.map('map').setView([19.4326, -99.1332], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

/* ---------- Init ---------- */

addHeatmapToggle(map);

loadMarkers(map).then(function (layer) {
  if (layer) {
    initSearch(map, layer);
    initFilters(map, layer);
  }
});
