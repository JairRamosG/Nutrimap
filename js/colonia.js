/* ========================================
   NutriMap — Score de acceso a comida sana por colonia (#16)
   ========================================
   Para cada colonia de data/colonias.json (leída en runtime, NUNCA hardcodeada),
   agrega los establecimientos dentro de COLONIA_RADIUS_KM (~1km) del centroide,
   pondera por distancia y deriva un score 0..1 de acceso a comida sana.

   MAYOR score = más acceso a comida sana. Un score `null` = "sin datos"
   (no es 0, ni bajo ni alto; la ausencia de datos NO se fuerza a 0 al renderizar).

   ---- Fórmula de distancia (documentada; requiere haversine en km) ----
     w(d) = 1 / (d + COLONIA_BIAS_KM)   con COLONIA_BIAS_KM = 0.2 km

   - Un establecimiento en el centroide (d=0) → w = 5: domina localmente.
   - Uno en el borde del radio (d=1km)     → w ≈ 0.833. Decaimiento explícito.
   - El bias evita división por cero y acota el peso máximo a 1/bias.

   ---- Agregación ----
     score = Σ(w_i * h_i) / Σ(w_i)

   h_i = slot de salud (proviene de getHealthSlot en markers.js, NO se redefine):
     fresh  = 1.0   (verdulería/panadería/carnicería → acceso a comida sana)
     junk   = 0.0   (tienda de conveniencia → chatarra)
     mixed  = 0.5   (supermercado/abarrotes/mercado) — NEUTRO por diseño
     unknown→mixed = 0.5 (neutral por defecto)
   Solo fresh vs junk sesgan el score hacia los extremos; mixed tira al CENTRO
   (no hacia lo sano ni lo chatarra).

   ---- Performance y cacheado ----
   88 colonias × ~2400 establecimientos ≈ 211k distancia. Antes del haversine se
   descarta por bounding box (|Δlat| o |Δlng| > radio en grados → continue), así
   el haversine corre solo sobre candidatos plausibles. El cómputo corre UNA vez
   por set de datos (al cargar, ver markers.js) y se cachea en coloniaScoresCache;
   search/filters/render del mapa NO lo re-escannean.
   ======================================== */

const COLONIA_RADIUS_KM = 1;
const COLONIA_BIAS_KM = 0.2;
const COLONIA_SCORE_DECIMALS = 4;
// Con menos de este número de establecimientos en el radio el score se marca
// como lowConfidence (muestra diminuta, p. ej. n=1, puede salir extremo).
const COLONIA_LOW_CONFIDENCE_N = 3;

// Valor de health por slot (ver comentario del header).
const COLONIA_SLOT_VALUE = { fresh: 1, junk: 0, mixed: 0.5 };

let coloniasData = null;
let coloniasPromise = loadColonias();
let coloniaScoresCache = null;

async function loadColonias() {
  try {
    const res = await fetch('data/colonias.json');
    const data = await res.json();
    coloniasData = Array.isArray(data) ? data : [];
    return coloniasData;
  } catch (err) {
    console.error('No se pudo cargar data/colonias.json:', err);
    coloniasData = [];
    return [];
  }
}

// Haversine en km. Reutiliza la de markers.js; fallback local idéntico por si
// el orden de carga no garantiza la dependencia (robustez, no dualidad).
function distKm(lat1, lon1, lat2, lon2) {
  if (typeof haversineKm === 'function') return haversineKm(lat1, lon1, lat2, lon2);
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Slot de salud. Reutiliza getHealthSlot de markers.js; fallback mínimo local
// (la misma taxonomía) por robustez frente al orden de carga.
const COLONIA_SLOT_BY_TYPE = {
  supermarket: 'mixed',
  grocery: 'mixed',
  marketplace: 'mixed',
  convenience: 'junk',
  greengrocer: 'fresh',
  bakery: 'fresh',
  butcher: 'fresh'
};

function getColoniaSlot(type) {
  if (typeof getHealthSlot === 'function') return getHealthSlot(type);
  return COLONIA_SLOT_BY_TYPE[type] || 'mixed';
}

// Puntúa UNA colonia desde SU PROPIO centroide. Notable: un establecimiento
// dentro del radio de varias colonias contribuye al score de cada una; ningún
// establecimiento se "consume" ni se deduplica entre colonias (overlap ok).
function computeColoniaScore(colonia, establishments) {
  const lat = colonia.lat;
  const lng = colonia.lng;
  const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 1e-9);
  const latDeg = COLONIA_RADIUS_KM / 111;
  const lngDeg = COLONIA_RADIUS_KM / (111 * cosLat);

  let sumW = 0;
  let sumWH = 0;
  let sampleSize = 0;

  for (const e of establishments) {
    const eLat = e.lat;
    const eLng = e.lng;
    if (typeof eLat !== 'number' || typeof eLng !== 'number') continue;

    // Early-exit por bounding box: si alguna coordenada excede el radio en
    // grados, el punto está fuera del radio en km → ni haversine.
    if (Math.abs(lat - eLat) > latDeg || Math.abs(lng - eLng) > lngDeg) continue;

    const d = distKm(lat, lng, eLat, eLng);
    if (d > COLONIA_RADIUS_KM) continue;

    const h = COLONIA_SLOT_VALUE[getColoniaSlot(e.type)] != null
      ? COLONIA_SLOT_VALUE[getColoniaSlot(e.type)]
      : 0.5;

    const w = 1 / (d + COLONIA_BIAS_KM); // decaimiento explícito y finito
    sumW += w;
    sumWH += w * h;
    sampleSize++;
  }

  // Sin establecimientos en el radio (o sin distancias válidas: Σw=0) → "sin
  // datos". NUNCA 0, ni se fuerza a 0 al renderizar.
  if (sampleSize === 0 || !(sumW > 0)) {
    return { score: null, sampleSize: 0, lowConfidence: true, hasData: false };
  }

  const raw = sumWH / sumW;
  // Rango documentado 0..1, JSON-safe (finito, redondeado, clampado).
  const factor = 10 ** COLONIA_SCORE_DECIMALS;
  const score = Math.min(1, Math.max(0, Math.round(raw * factor) / factor));

  return {
    score,
    sampleSize,
    lowConfidence: sampleSize < COLONIA_LOW_CONFIDENCE_N,
    hasData: true
  };
}

// Cálculo síncrono puro: colonias → array ordenado de resultados.
function buildColoniaScores(colonias, establishments) {
  const out = colonias.map((c) => {
    const r = computeColoniaScore(c, establishments || []);
    return {
      name: c.name,
      alcaldia: c.alcaldia,
      score: r.score,
      sampleSize: r.sampleSize,
      lowConfidence: r.lowConfidence,
      hasData: r.hasData
    };
  });
  // Orden: score desc, "sin datos" al final; empates por nombre asc.
  out.sort((a, b) => {
    if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function getEstablishments() {
  // allEstablishments viene de markers.js; typeof por seguridad de orden.
  return (typeof allEstablishments !== 'undefined' && allEstablishments) ? allEstablishments : [];
}

function expose() {
  if (typeof window === 'undefined') return;
  window.NUTRIMAP = window.NUTRIMAP || {};
  window.NUTRIMAP.getColoniaHealthScores = getColoniaHealthScores;
  window.NUTRIMAP.coloniaHealthScores = coloniaScoresCache;
}

// Getter QA: devuelve el cacheado, o lo calcula bajo demanda. Insider:
// window.NUTRIMAP.getColoniaHealthScores() → [{name, alcaldia, score, sampleSize,
// lowConfidence, hasData}, ...].
function getColoniaHealthScores() {
  if (coloniaScoresCache) return coloniaScoresCache;
  if (coloniasData && Array.isArray(coloniasData)) {
    coloniaScoresCache = buildColoniaScores(coloniasData, getEstablishments());
    expose();
  }
  return coloniaScoresCache || [];
}

// Recalcula UNA vez cuando cambia el set de establecimientos (lo invoca
// markers.js tras render). Cacheable: no se repite por interacción del mapa.
async function recomputeColoniaHealthScores() {
  const colonias = await coloniasPromise;
  coloniaScoresCache = buildColoniaScores(colonias, getEstablishments());
  expose();
  return coloniaScoresCache;
}

// Hook de testabilidad (Node): sin efecto en el navegador (module no existe).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { recomputeColoniaHealthScores, getColoniaHealthScores };
}