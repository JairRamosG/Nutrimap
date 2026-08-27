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

const OVERPASS_QUERY = `[out:json][timeout:30];area["name"="Ciudad de México"]->.cdmx;(node["shop"="supermarket"](area.cdmx);node["shop"="grocery"](area.cdmx);node["amenity"="marketplace"](area.cdmx););out body 200;`;

let markersCache = null;

function createMarkerIcon(type, healthColor, name, addr) {
  const color = healthColor || MARKER_COLORS[type] || '#6b7280';
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

function showLoading(map) {
  const loading = L.control({ position: 'topright' });
  loading.onAdd = function () {
    const div = L.DomUtil.create('div', 'loading-control');
    div.innerHTML = '<span class="spinner"></span> Cargando establecimientos...';
    return div;
  };
  loading.addTo(map);
  return loading;
}

function showError(map, message) {
  const error = L.control({ position: 'topright' });
  error.onAdd = function () {
    const div = L.DomUtil.create('div', 'error-control');
    div.innerHTML = `<span class="error-icon">⚠️</span> ${message}`;
    return div;
  };
  error.addTo(map);
  return error;
}

async function loadMarkers(map) {
  if (markersCache) {
    renderMarkers(map, markersCache);
    return;
  }
  
  const loadingControl = showLoading(map);
  let errorControl = null;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const data = await response.json();
    markersCache = data;

    renderMarkers(map, data);

    loadingControl.remove();
  } catch (err) {
    loadingControl.remove();
    errorControl = showError(map, 'No se pudieron cargar los establecimientos. Intentá de nuevo más tarde.');
    console.error('Error cargando establecimientos:', err);
  }
}

function renderMarkers(map, data) {
  const markersLayer = L.layerGroup().addTo(map);
  const heatPoints = [];

  const markerPromises = data.elements.map(async (el) => {
    const type = getMarkerType(el.tags);
    const name = el.tags.name || 'Sin nombre';
    const addr = [
      el.tags['addr:street'],
      el.tags['addr:housenumber']
    ].filter(Boolean).join(' ') || 'Sin dirección registrada';

    const health = await getHealthForEstablishment(type);

    const hsLabel = health ? health.label : 'N/A';
    const hsColor = health ? getHealthScoreColor(health.label) : '#6b7280';
    const hsText = health ? `Health Score: ${health.label} (${health.productCount} productos)` : 'Health Score: N/A';

    const popupContent = `
      <div class="popup-content">
        <div class="popup-type" style="color:${MARKER_COLORS[type]}">${getMarkerTypeName(type)}</div>
        <div class="popup-name">${name}</div>
        <div class="popup-address">${addr}</div>
        <div class="popup-health"><strong>${hsText}</strong></div>
        <div class="popup-checkbox-row">
          <input type="checkbox" class="popup-compare-checkbox"
            data-name="${name}" data-typecode="${type}"
            data-type="${getMarkerTypeName(type)}" data-address="${addr}">
          <label class="popup-compare-label">Seleccionar para comparar</label>
        </div>
      </div>
    `;

    const marker = L.marker([el.lat, el.lon], {
      icon: createMarkerIcon(type, hsColor, name, addr)
    }).bindPopup(popupContent);

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

    markersLayer.addLayer(marker);
    heatPoints.push([el.lat, el.lon, 0.5]);
  });

  Promise.all(markerPromises).then(() => {
    createHeatLayer(map, heatPoints);
    preloadNutritionData();
  });
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
