/* ========================================
   NutriMap — Heatmap de SALUD por colonia (#17)
   ========================================
   Un punto POR COLONIA (no por establecimiento), con intensidad derivada del
   score de acceso a comida sana de #16 (getColoniaHealthScores).

   - Chatarra (score bajo)  → intensidad 1 → ROJO.
   - Sano (score alto)      → intensidad 0 → VERDE.
   - Sin datos (score null) → capa GRIS separada (nunca tiñe el gradiente).
   - Baja confianza (sampleSize < 3) → capa de calor atenuada aparte.

   ---- Normalización de intensidad (RELATIVA al rango observado) ----
   S = { s : s.hasData === true }  (excluye score null).
   raw = 1 - s
     Smax = max(S), Smin = min(S), ε = 1e-6
     si Smax - Smin >= ε: intensity = (Smax - s) / (Smax - Smin)
       → colonia sana (score alto) → intensity 0 → VERDE
       → colonia chatarra (score bajo) → intensity 1 → ROJO
     si rango DEGENERADO (Smax - Smin < ε, p. ej. todos los scores iguales):
       NO se divide por cero → fallback intensity = clamp(1 - s, 0, 1).
       Todas las colonias con dato quedan en un color medio del gradiente.
   Toda intensity se clampa a [0,1]; NaN/Infinity → punto descartado (nunca
   tiñe extremos falsos ni crashea).

   El gradiente usa `max: 1.0` (no 0.8) para que intensity=1 alcance el tope
   rojo del gradiente.
   ======================================== */

let healthHeatGroup = null; // layerGroup padre: calor coloreado + gris sin-datos
let heatmapActive = false;

const HEALTH_HEAT_GRADIENT = {
  0.0: '#00ff00',
  0.3: '#66ff00',
  0.5: '#ffff00',
  0.7: '#ff8800',
  1.0: '#ff0000'
};
const HEALTH_NO_DATA_COLOR = '#9e9e9e';
const HEALTH_HEAT_RADIUS = 34;
const HEALTH_HEAT_BLUR = 24;
const HEALTH_HEAT_MAX_ZOOM = 18;
const HEALTH_HEAT_MAX = 1.0;
const HEALTH_HEAT_MIN_OPACITY = 0.3;
const HEALTH_LOW_CONFIDENCE_OPACITY = 0.45;
const HEALTH_NO_DATA_OPACITY = 0.7;
const HEALTH_NORM_EPSILON = 1e-6;

function currentColoniaScores() {
  if (typeof window !== 'undefined' && window.NUTRIMAP &&
      typeof window.NUTRIMAP.getColoniaHealthScores === 'function') {
    return window.NUTRIMAP.getColoniaHealthScores() || [];
  }
  if (typeof getColoniaHealthScores === 'function') {
    return getColoniaHealthScores() || [];
  }
  return [];
}

// Devuelve intensity 0..1 por colonia (o ausente si no dibujable) y si hay datos.
function computeHealthIntensities(scores) {
  const S = scores.filter((s) =>
    s.hasData === true && s.score !== null && Number.isFinite(s.score)
  );
  const intensityByName = Object.create(null);
  if (S.length === 0) return { intensityByName, hasData: false };

  let smax = -Infinity;
  let smin = Infinity;
  for (const s of S) {
    if (s.score > smax) smax = s.score;
    if (s.score < smin) smin = s.score;
  }
  const range = smax - smin;
  const useRange = range >= HEALTH_NORM_EPSILON;

  for (const s of S) {
    // Fallback degenerado nunca divide por cero; clamp [0,1]; descarta no-finito.
    let intensity = useRange ? (smax - s.score) / range : (1 - s.score);
    intensity = Math.max(0, Math.min(1, intensity));
    if (!Number.isFinite(intensity)) continue;
    intensityByName[s.name] = intensity;
  }
  return { intensityByName, hasData: true };
}

// Construye el layerGroup de salud (calor coloreado + baja confianza + gris).
function buildHealthHeatLayer(map, coloniaScores) {
  const scores = Array.isArray(coloniaScores) && coloniaScores.length
    ? coloniaScores
    : currentColoniaScores();

  const { intensityByName, hasData } = computeHealthIntensities(scores);

  const group = L.layerGroup();
  const colored = { full: [], low: [] };
  const grey = [];
  let lowHeat = null;

  for (const c of scores) {
    // Sin datos → capa gris separada; nunca entra al gradiente.
    if (c.hasData !== true || c.score === null) {
      grey.push(c);
      continue;
    }
    const intensity = intensityByName[c.name];
    if (intensity === undefined || !Number.isFinite(intensity)) continue;
    const bucket = c.lowConfidence ? colored.low : colored.full;
    bucket.push([c.lat, c.lng, intensity]);
  }

  if (hasData && (colored.full.length || colored.low.length)) {
    const opts = {
      radius: HEALTH_HEAT_RADIUS,
      blur: HEALTH_HEAT_BLUR,
      maxZoom: HEALTH_HEAT_MAX_ZOOM,
      max: HEALTH_HEAT_MAX,
      minOpacity: HEALTH_HEAT_MIN_OPACITY,
      gradient: HEALTH_HEAT_GRADIENT
    };
    if (colored.full.length) group.addLayer(L.heatLayer(colored.full, opts));
    if (colored.low.length) {
      lowHeat = L.heatLayer(colored.low, opts);
      group.addLayer(lowHeat);
    }
  }

  if (grey.length) {
    const greyGroup = L.layerGroup();
    for (const c of grey) {
      L.circleMarker([c.lat, c.lng], {
        radius: HEALTH_HEAT_RADIUS * 0.6,
        color: HEALTH_NO_DATA_COLOR,
        weight: 1,
        fillColor: HEALTH_NO_DATA_COLOR,
        fillOpacity: HEALTH_NO_DATA_OPACITY,
        opacity: HEALTH_NO_DATA_OPACITY
      }).addTo(greyGroup);
    }
    group.addLayer(greyGroup);
  }

  return { group, lowHeat, hasData };
}

// Create/repurpose: construye el heatmap de salud (NO densidad) y lo añade.
// Recibe scores opcionales; si no vienen, los lee de getColoniaHealthScores().
function createHealthHeatLayer(map, coloniaScores) {
  if (healthHeatGroup) {
    try { map.removeLayer(healthHeatGroup); } catch (e) { /* ignore */ }
    healthHeatGroup = null;
  }

  const built = buildHealthHeatLayer(map, coloniaScores);
  if (!built || !built.group || built.group.getLayers().length === 0) {
    return null; // sin datos / sin colonias → no-op, no crashea
  }

  healthHeatGroup = built.group;
  healthHeatGroup.addTo(map);

  // Atenuar baja confianza: solo su capa de calor, no el gris ni la plena.
  if (built.lowHeat && built.lowHeat._canvas) {
    built.lowHeat._canvas.style.opacity = String(HEALTH_LOW_CONFIDENCE_OPACITY);
  }

  heatmapActive = true;
  updateToggleButton();
  return healthHeatGroup;
}

// Build asíncrono: asegura que los scores de #16 estén disponibles y luego
// construye. Se invoca tras recomputeColoniaHealthScores(); no-op si no hay.
function buildHealthHeat(map) {
  const scores = currentColoniaScores();
  if (!scores || scores.length === 0) return false; // no-op, nunca crashea
  return createHealthHeatLayer(map, scores) != null;
}

function toggleHeatmap(map) {
  if (!healthHeatGroup) return;

  if (heatmapActive) {
    map.removeLayer(healthHeatGroup);
    heatmapActive = false;
  } else {
    // Re-muestra EL MISMO heatmap de salud (color + gris juntos), nunca densidad.
    healthHeatGroup.addTo(map);
    heatmapActive = true;
  }
  updateToggleButton();
}

function updateToggleButton() {
  const btn = document.getElementById('heatmap-toggle');
  if (!btn) return;

  if (heatmapActive) {
    btn.classList.add('active');
    btn.classList.remove('inactive');
    btn.title = 'Ocultar mapa de calor';
  } else {
    btn.classList.remove('active');
    btn.classList.add('inactive');
    btn.title = 'Mostrar mapa de calor';
  }
}

function addHeatmapToggle(map) {
  const Control = L.Control.extend({
    onAdd: function () {
      const btn = L.DomUtil.create('button', 'leaflet-control heatmap-toggle');
      btn.id = 'heatmap-toggle';
      btn.innerHTML = '🔥';
      btn.title = 'Mostrar mapa de calor';
      L.DomEvent.disableClickPropagation(btn);
      btn.addEventListener('click', function () {
        toggleHeatmap(map);
      });
      return btn;
    }
  });

  new Control({ position: 'topleft' }).addTo(map);
  updateToggleButton();
}