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

const OVERPASS_QUERY = `[out:json];area["name"="Ciudad de México"]->.cdmx;(node["shop"="supermarket"](area.cdmx);node["shop"="grocery"](area.cdmx);node["amenity"="marketplace"](area.cdmx););out body;`;

function createMarkerIcon(type) {
  const color = MARKER_COLORS[type] || '#6b7280';
  const icon = MARKER_ICONS[type] || '📍';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:14px;">${icon}</div>`,
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

    const markersLayer = L.layerGroup().addTo(map);

    data.elements.forEach((el) => {
      const type = getMarkerType(el.tags);
      const name = el.tags.name || 'Sin nombre';
      const addr = [
        el.tags['addr:street'],
        el.tags['addr:housenumber']
      ].filter(Boolean).join(' ') || 'Sin dirección registrada';

      const popupContent = `
        <div class="popup-content">
          <div class="popup-type" style="color:${MARKER_COLORS[type]}">${getMarkerTypeName(type)}</div>
          <div class="popup-name">${name}</div>
          <div class="popup-address">${addr}</div>
        </div>
      `;

      const marker = L.marker([el.lat, el.lon], {
        icon: createMarkerIcon(type)
      }).bindPopup(popupContent);

      markersLayer.addLayer(marker);
    });

    loadingControl.remove();
  } catch (err) {
    loadingControl.remove();
    errorControl = showError(map, 'No se pudieron cargar los establecimientos. Intentá de nuevo más tarde.');
    console.error('Error cargando establecimientos:', err);
  }
}
