/* ========================================
   Buscador Inteligente de Comida
   Filtro de marcadores + Top 3 por Health Score
   ======================================== */

const SEARCH_CATEGORIES = [
  'fruits', 'vegetables', 'cereals', 'dairy-products', 'breads',
  'meat', 'fish', 'eggs', 'legumes', 'nuts', 'oils', 'sugars',
  'beverages', 'snacks', 'frozen-foods', 'fresh-foods',
  'supermarket', 'grocery', 'organic', 'whole-grains',
  'low-fat', 'low-sugar', 'high-protein', 'vegan', 'vegetarian'
];

const SPANISH_TO_ENGLISH = {
  'frutas': 'fruits',
  'fruta': 'fruits',
  'lacteos': 'dairy',
  'leche': 'dairy',
  'cereales': 'cereals',
  'pan': 'bread',
  'carnes': 'meat',
  'carne': 'meat',
  'pescado': 'fish',
  'verduras': 'vegetables',
  'verdura': 'vegetables',
  'bebidas': 'beverages',
  'jugos': 'juices',
  'snacks': 'snacks',
  'dulces': 'sweets',
  'comida': 'food',
  'saludable': 'healthy',
  'baja en calorias': 'low-calorie',
  'integral': 'whole-wheat'
};

function translateQuery(query) {
  const lower = query.toLowerCase().trim();
  return SPANISH_TO_ENGLISH[lower] || lower;
}

let searchMarkersRef = null;
let searchMapRef = null;
let searchOverlayActive = false;
let allMarkersData = [];

function createSearchDOM() {
  if (document.getElementById('search-container')) return;

  const container = document.createElement('div');
  container.id = 'search-container';
  container.innerHTML = `
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Buscar comida (ej: frutas, lacteos...)"
        autocomplete="off" aria-label="Buscar comida">
      <button id="search-btn" aria-label="Buscar" class="search-action-btn">🔍</button>
      <button id="clear-btn" aria-label="Limpiar búsqueda" class="search-action-btn clear-btn" style="display:none;">✕</button>
      <div id="search-spinner" class="search-spinner" style="display:none;">
        <span class="spinner"></span>
      </div>
    </div>
    <ul id="search-suggestions" class="search-suggestions" style="display:none;"></ul>
    <div id="search-results" class="search-results" style="display:none;"></div>
  `;

  document.getElementById('map').appendChild(container);
  bindSearchEvents();
}

function bindSearchEvents() {
  const input = document.getElementById('search-input');
  const suggestions = document.getElementById('search-suggestions');
  const clearBtn = document.getElementById('clear-btn');
  const searchBtn = document.getElementById('search-btn');

  input.addEventListener('input', function () {
    const val = this.value.trim().toLowerCase();
    if (val.length === 0) {
      hideSuggestions();
      return;
    }
    showAutocomplete(val);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = this.value.trim();
      if (val) executeSearch(val);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  searchBtn.addEventListener('click', function () {
    const val = input.value.trim();
    if (val) executeSearch(val);
  });

  clearBtn.addEventListener('click', clearSearch);

  document.addEventListener('click', function (e) {
    if (!suggestions.contains(e.target) && e.target !== input) {
      hideSuggestions();
    }
  });
}

function showAutocomplete(query) {
  const suggestions = document.getElementById('search-suggestions');
  const matches = SEARCH_CATEGORIES.filter(c => c.includes(query)).slice(0, 5);

  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  suggestions.innerHTML = matches.map(m =>
    `<li class="suggestion-item" data-category="${m}">${m}</li>`
  ).join('');

  suggestions.style.display = 'block';

  suggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', function () {
      const category = this.dataset.category;
      document.getElementById('search-input').value = category;
      hideSuggestions();
      executeSearch(category);
    });
  });
}

function hideSuggestions() {
  const suggestions = document.getElementById('search-suggestions');
  if (suggestions) suggestions.style.display = 'none';
}

async function executeSearch(query) {
  if (!searchMapRef) return;

  const spinner = document.getElementById('search-spinner');
  const clearBtn = document.getElementById('clear-btn');
  const resultsDiv = document.getElementById('search-results');

  spinner.style.display = 'flex';
  clearBtn.style.display = 'flex';
  resultsDiv.style.display = 'none';

  try {
    const translatedQuery = translateQuery(query);
    const products = await searchProductsByCategory(translatedQuery, 30);
    filterMarkersBySearch(query, products);

    if (allMarkersData.length === 0) {
      showNoResults();
    } else {
      showSearchResults(allMarkersData, products);
    }

    searchOverlayActive = true;
  } catch (err) {
    console.error('Error en búsqueda:', err);
    showNoResults();
  } finally {
    spinner.style.display = 'none';
  }
}

function filterMarkersBySearch(query, products) {
  if (!searchMarkersRef) return;

  const matchingCoords = [];
  allMarkersData = [];

  searchMarkersRef.eachLayer(function (layer) {
    if (layer instanceof L.Marker && layer.options.icon) {
      const el = layer.getElement();
      if (!el) return;

      const markerDiv = el.querySelector('.marker-circle');
      if (!markerDiv) return;

      const name = markerDiv.dataset.estName || '';
      const address = markerDiv.dataset.estAddress || '';
      const type = getMarkerTypeFromIcon(layer);

      const isMatch = typeMatchesQuery(type, query) || nameMatchesProducts(name, products);

      if (isMatch) {
        layer.setOpacity(1);
        layer.setZIndexOffset(1000);
        matchingCoords.push(layer.getLatLng());
        allMarkersData.push({ name, address, type, latLng: layer.getLatLng() });
      } else {
        layer.setOpacity(0.15);
        layer.setZIndexOffset(-1000);
      }
    }
  });

  if (matchingCoords.length > 0) {
    const bounds = L.latLngBounds(matchingCoords);
    searchMapRef.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
}

function getMarkerTypeFromIcon(marker) {
  const icon = marker.getIcon();
  if (!icon || !icon.options || !icon.options.html) return 'unknown';
  const html = icon.options.html;
  if (html.includes('🛒')) return 'supermarket';
  if (html.includes('🏪')) return 'grocery';
  if (html.includes('🏬')) return 'marketplace';
  return 'unknown';
}

function typeMatchesQuery(type, query) {
  const typeNames = {
    supermarket: ['supermercado', 'supermarket', 'tienda'],
    grocery: ['tienda', 'abarrotes', 'grocery', 'mini'],
    marketplace: ['mercado', 'marketplace', 'local']
  };
  const names = typeNames[type] || [];
  return names.some(n => n.includes(query.toLowerCase()));
}

function nameMatchesProducts(name, products) {
  if (!products || products.length === 0) return false;
  const lowerName = name.toLowerCase();
  return products.some(p => {
    const productName = (p.product_name || '').toLowerCase();
    return productName.includes(lowerName) || lowerName.includes(productName.split(' ')[0]);
  });
}

function showSearchResults(markersData, products) {
  const resultsDiv = document.getElementById('search-results');

  const sorted = markersData
    .map(m => ({ ...m, score: calculateScoreForMarker(m, products) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  let html = '<div class="results-header"><h4>Top 3 recomendados</h4></div>';
  sorted.forEach((item, i) => {
    const scoreLabel = item.score >= 0.7 ? 'A' : item.score >= 0.5 ? 'B' : item.score >= 0.35 ? 'C' : 'D';
    const scoreColor = getHealthScoreColor(scoreLabel);
    const markerProducts = products.filter(p => {
      const productName = (p.product_name || '').toLowerCase();
      return productName.includes(item.name.toLowerCase().split(' ')[0]);
    });
    html += `
      <div class="result-card" data-lat="${item.latLng.lat}" data-lng="${item.latLng.lng}">
        <span class="result-rank">#${i + 1}</span>
        <div class="result-info">
          <span class="result-name">${item.name}</span>
          <span class="result-address">${item.address}</span>
        </div>
        <span class="result-score" style="background:${scoreColor};">${scoreLabel}</span>
      </div>
      <div class="result-products">
        <strong>Productos:</strong>
        ${markerProducts.slice(0, 3).map(p => `
          <div class="product-item">
            <span>${p.product_name}</span>
            <span class="product-score" style="color:${getHealthScoreColor(p.nutrition_grades)}">${p.nutrition_grades?.toUpperCase() || 'N/A'}</span>
          </div>
        `).join('')}
      </div>
    `;
  });

  resultsDiv.innerHTML = html;
  resultsDiv.style.display = 'block';

  resultsDiv.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', function () {
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);
      searchMapRef.setView([lat, lng], 16);
    });
  });
}

function calculateScoreForMarker(markerData, products) {
  if (!products || products.length === 0) return 0;
  const filtered = products.filter(p => {
    const name = (p.product_name || '').toLowerCase();
    return name.includes(markerData.name.toLowerCase().split(' ')[0]);
  });
  if (filtered.length === 0) return 0.5;
  const health = calculateHealthScore(filtered);
  return health ? health.score : 0.5;
}

function showNoResults() {
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = `
    <div class="no-results">
      <span class="no-results-icon">🔍</span>
      <p>No se encontraron establecimientos para esta búsqueda</p>
    </div>
  `;
  resultsDiv.style.display = 'block';
}

function clearSearch() {
  if (!searchMarkersRef) return;

  searchMarkersRef.eachLayer(function (layer) {
    if (layer instanceof L.Marker) {
      layer.setOpacity(1);
      layer.setZIndexOffset(0);
    }
  });

  document.getElementById('search-input').value = '';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('clear-btn').style.display = 'none';
  document.getElementById('search-suggestions').style.display = 'none';
  searchOverlayActive = false;
  allMarkersData = [];
}

function initSearch(map, markersLayer) {
  searchMapRef = map;
  searchMarkersRef = markersLayer;
  createSearchDOM();
}
