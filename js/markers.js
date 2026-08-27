const MARKER_COLORS = {
  supermarket: '#3b82f6',
  grocery: '#f97316',
  marketplace: '#22c55e'
};

const MARKER_ICONS = {
  supermarket: '🛒',
  grocery: '🏪',
  marketplace: '🏬'
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `[out:json][timeout:30];area["name"="Ciudad de México"]->.cdmx;(node["shop"="supermarket"](area.cdmx);node["shop"="grocery"](area.cdmx);node["amenity"="marketplace"](area.cdmx););out body 200;`;

let markersLayerRef = null;
let allEstablishments = [];
let lastElements = [];

function createMarkerIcon(type, healthColor, name, addr) {
  const color = healthColor || MARKER_COLORS[type] || HEALTH_NA_COLOR;
  const icon = MARKER_ICONS[type] || '📍';
  const safeName = (name || '').replace(/"/g, '&quot;');
  const safeAddr = (addr || '').replace(/"/g, '&quot;');
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-circle" style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:14px;" data-est-name="${safeName}" data-est-address="${safeAddr}">${icon}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

function getMarkerType(tags) {
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.shop === 'grocery') return 'grocery';
  if (tags.amenity === 'marketplace') return 'marketplace';
  return 'unknown';
}

function getMarkerTypeName(type) {
  const names = {
    supermarket: 'Supermercado',
    grocery: 'Tienda de abarrotes',
    marketplace: 'Mercado',
    unknown: 'Otro'
  };
  return names[type] || type;
}

/* ---------- Persistencia en localStorage (TTL + version key) ---------- */

function writeEstablishmentsCache(record) {
  try {
    localStorage.setItem(CACHE_VERSION, JSON.stringify(record));
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err instanceof DOMException)) {
      console.warn('Cache local lleno (quota). Continuando solo en memoria.', err);
    } else {
      console.warn('No se pudo persistir el caché local.', err);
    }
  }
}

function readEstablishmentsCache() {
  try {
    const raw = localStorage.getItem(CACHE_VERSION);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== CACHE_VERSION) return null;
    const age = Date.now() - (record.timestamp || 0);
    if (age > CACHE_TTL_MS) return null; // expirado -> se invalida y refetchea
    return record;
  } catch (err) {
    return null;
  }
}

function seedHealthMemo(memo) {
  if (!memo) return;
  for (const key of Object.keys(memo)) {
    if (healthByKey[key] === undefined) healthByKey[key] = memo[key];
  }
}

function persistCache() {
  const record = {
    version: CACHE_VERSION,
    timestamp: Date.now(),
    elements: lastElements,
    healthMemo: Object.assign({}, healthByKey)
  };
  writeEstablishmentsCache(record);
}

/* ---------- Carga / revalidación ---------- */

function buildPopupContent(entry) {
  const healthText = entry.health
    ? `Health Score: ${entry.health.label} (${entry.health.productCount} productos)`
    : 'Health Score: N/A';
  return `
    <div class="popup-content">
      <div class="popup-type" style="color:${MARKER_COLORS[entry.type]}">${entry.typeName}</div>
      <div class="popup-name">${entry.name}</div>
      <div class="popup-address">${entry.address}</div>
      <div class="popup-health"><strong>${healthText}</strong></div>
      <div class="popup-checkbox-row">
        <input type="checkbox" class="popup-compare-checkbox"
          data-name="${entry.name}" data-typecode="${entry.type}"
          data-type="${entry.typeName}" data-address="${entry.address}">
        <label class="popup-compare-label">Seleccionar para comparar</label>
      </div>
    </div>
  `;
}

function renderMarkers(map, elements, options = {}) {
  const skipPreload = !!options.skipPreload;
  const layer = markersLayerRef || L.layerGroup().addTo(map);
  markersLayerRef = layer;
  layer.clearLayers();
  allEstablishments = [];
  lastElements = elements || [];

  const heatPoints = [];
  const keyToEntries = new Map();

  for (const el of (elements || [])) {
    const type = getMarkerType(el.tags);
    const brand = (el.tags.brand || '').trim() || null;
    const name = el.tags.name || 'Sin nombre';
    const addr = [
      el.tags['addr:street'],
      el.tags['addr:housenumber']
    ].filter(Boolean).join(' ') || 'Sin dirección registrada';
    const colonia = el.tags['addr:suburb'] || el.tags['addr:neighbourhood'] || '';
    const postcode = el.tags['addr:postcode'] || '';

    const entry = {
      id: el.id,
      name: name,
      type: type,
      typeName: getMarkerTypeName(type),
      address: addr,
      colonia: colonia,
      postcode: postcode,
      lat: el.lat,
      lng: el.lon,
      brand: brand,
      healthKey: buildHealthKey(type, brand),
      // Estado inicial neutro/gris; nunca hereda color de una request anterior.
      health: null,
      healthLabel: 'N/A',
      healthColor: HEALTH_NA_COLOR,
      marker: null
    };

    // Los marcadores se dibujan sin esperar la red.
    const marker = L.marker([el.lat, el.lon], {
      icon: createMarkerIcon(type, HEALTH_NA_COLOR, name, addr)
    }).bindPopup('');

    marker.on('popupopen', function () {
      marker.setPopupContent(buildPopupContent(entry));
    });

    marker.on('click', function () {
      openNutritionPanel({
        name: name,
        type: getMarkerTypeName(type),
        typeCode: type,
        address: addr
      });
    });

    marker.on('popupopen', function () {
      const checkbox = marker.getElement()?.querySelector('.popup-compare-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', function (e) {
          e.stopPropagation();
          toggleEstablishment({
            name: name,
            typeCode: type,
            type: getMarkerTypeName(type),
            address: addr
          });
        });
      }
    });

    entry.marker = marker;
    layer.addLayer(marker);
    allEstablishments.push(entry);
    heatPoints.push([el.lat, el.lon, 0.5]);

    const list = keyToEntries.get(entry.healthKey) || [];
    list.push(entry);
    keyToEntries.set(entry.healthKey, list);
  }

  // Health score diferido: una sola request por clave única (dedupe en api.js).
  const keys = Array.from(keyToEntries.keys());

  Promise.all(keys.map(async (key) => {
    const [type, brand] = key.split('::');
    const health = await getHealthForEstablishment(type, brand);
    const entries = keyToEntries.get(key);
    const label = health ? health.label : 'N/A';
    const color = getHealthScoreColor(label);

    for (const entry of entries) {
      entry.health = health;
      entry.healthLabel = label;
      entry.healthColor = color;
      entry.marker.setIcon(createMarkerIcon(entry.type, color, entry.name, entry.address));
    }
  })).then(() => {
    createHeatLayer(map, heatPoints);
    if (!skipPreload) {
      preloadNutritionData();
    }
    persistCache();
  });

  return layer;
}

async function fetchOverpassWithRetry() {
  const data = await fetchJsonWithRetry(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`
  });
  return data.elements || [];
}

async function loadMarkers(map) {
  // 1) Caché válido: render inmediato + revalidación en background.
  const cached = readEstablishmentsCache();
  if (cached && cached.elements && cached.elements.length) {
    seedHealthMemo(cached.healthMemo || {});
    renderMarkers(map, cached.elements, { skipPreload: true });
    revalidateInBackground(map);
    return markersLayerRef;
  }

  // 2) Caché frío: fetch Overpass con retry/backoff, render y persistencia.
  try {
    const elements = await fetchOverpassWithRetry();
    if (elements.length === 0) {
      console.warn('Overpass devolvió 0 establecimientos.');
    }
    renderMarkers(map, elements);
  } catch (err) {
    console.error('Error cargando establecimientos:', err);
  }

  return markersLayerRef;
}

async function revalidateInBackground(map) {
  try {
    const elements = await fetchOverpassWithRetry();
    renderMarkers(map, elements);
  } catch (err) {
    console.warn('Revalidación en background falló; se mantiene el caché.', err);
  }
}

async function preloadNutritionData() {
  const categories = ['supermarkets', 'groceries', 'markets'];

  for (const category of categories) {
    try {
      await searchProductsByCategory(category);
      console.log(`Preloaded: ${category}`);
    } catch (error) {
      console.warn(`Failed to preload ${category}:`, error);
    }
  }
}