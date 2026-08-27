/* ========================================
   Filtros y Búsqueda Avanzada
   Sidebar con lista de establecimientos
   ======================================== */

let filterMapRef = null;
let filterMarkersRef = null;
let coloniasData = [];
let activeFilters = {
  types: { supermarket: true, grocery: true, marketplace: true, convenience: true, greengrocer: true, bakery: true, butcher: true },
  minScore: null,
  searchQuery: '',
  searchColonia: null
};

/* ---------- Initialization ---------- */

async function initFilters(map, markersLayer) {
  filterMapRef = map;
  filterMarkersRef = markersLayer;

  try {
    const res = await fetch('data/colonias.json');
    coloniasData = await res.json();
  } catch (err) {
    console.warn('Error cargando colonias:', err);
    coloniasData = [];
  }

  createFilterSidebar();
  bindFilterEvents();
}

/* ---------- Create Sidebar DOM ---------- */

function createFilterSidebar() {
  if (document.getElementById('filter-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.className = 'filter-sidebar';
  sidebar.id = 'filter-sidebar';
  sidebar.innerHTML = `
    <div class="filter-sidebar-header">
      <h3>Filtros</h3>
      <button class="filter-toggle-btn" id="filter-toggle-btn" aria-label="Alternar filtros">
        <span class="filter-toggle-icon">☰</span>
      </button>
    </div>

    <div class="filter-sidebar-body" id="filter-sidebar-body">
      <div class="filter-section">
        <label class="filter-section-label" for="search-colonia">Buscar colonia</label>
        <div class="filter-search-wrapper">
          <input type="text" id="search-colonia" class="filter-input"
            placeholder="Ej: Roma, Polanco..." autocomplete="off"
            aria-label="Buscar colonia o código postal">
          <ul id="colonia-suggestions" class="colonia-suggestions" style="display:none;"></ul>
        </div>
      </div>

      <div class="filter-section">
        <span class="filter-section-label">Tipo de establecimiento</span>
        <div class="filter-checkbox-group">
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-supermarket" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🛒 Supermercado</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-grocery" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🏪 Tienda</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-marketplace" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🏬 Mercado</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-convenience" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🥤 Conveniencia</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-greengrocer" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🥬 Verdulería</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-bakery" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🥖 Panadería</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-butcher" checked>
            <span class="filter-checkbox-mark"></span>
            <span class="filter-checkbox-label">🥩 Carnicería</span>
          </label>
        </div>
      </div>

      <div class="filter-section">
        <span class="filter-section-label">Health Score mínimo</span>
        <div class="filter-score-buttons" role="radiogroup" aria-label="Filtrar por Health Score mínimo">
          <button class="filter-score-btn active" data-score="" aria-pressed="true">Todos</button>
          <button class="filter-score-btn" data-score="A" aria-pressed="false">
            <span class="score-letter" style="background:#22c55e;">A</span>
          </button>
          <button class="filter-score-btn" data-score="B" aria-pressed="false">
            <span class="score-letter" style="background:#3b82f6;">B</span>
          </button>
          <button class="filter-score-btn" data-score="C" aria-pressed="false">
            <span class="score-letter" style="background:#eab308;">C</span>
          </button>
          <button class="filter-score-btn" data-score="D" aria-pressed="false">
            <span class="score-letter" style="background:#f97316;">D</span>
          </button>
          <button class="filter-score-btn" data-score="E" aria-pressed="false">
            <span class="score-letter" style="background:#ef4444;">E</span>
          </button>
        </div>
      </div>

      <div class="filter-section filter-results-section">
        <div class="filter-results-count" id="filter-results-count">0 resultados</div>
        <button class="filter-clear-btn" id="filter-clear-btn" aria-label="Limpiar todos los filtros">Limpiar filtros</button>
      </div>

      <div class="filter-section">
        <ul class="filter-establishment-list" id="filter-establishment-list"></ul>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);
}

/* ---------- Bind Events ---------- */

function bindFilterEvents() {
  const toggleBtn = document.getElementById('filter-toggle-btn');
  const sidebarBody = document.getElementById('filter-sidebar-body');
  const clearBtn = document.getElementById('filter-clear-btn');
  const searchInput = document.getElementById('search-colonia');
  const suggestions = document.getElementById('colonia-suggestions');

  toggleBtn.addEventListener('click', function () {
    const sidebar = document.getElementById('filter-sidebar');
    sidebar.classList.toggle('collapsed');
  });

  document.getElementById('filter-supermarket').addEventListener('change', function () {
    activeFilters.types.supermarket = this.checked;
    applyFilters();
  });

  document.getElementById('filter-grocery').addEventListener('change', function () {
    activeFilters.types.grocery = this.checked;
    applyFilters();
  });

  document.getElementById('filter-marketplace').addEventListener('change', function () {
    activeFilters.types.marketplace = this.checked;
    applyFilters();
  });

  document.getElementById('filter-convenience').addEventListener('change', function () {
    activeFilters.types.convenience = this.checked;
    applyFilters();
  });

  document.getElementById('filter-greengrocer').addEventListener('change', function () {
    activeFilters.types.greengrocer = this.checked;
    applyFilters();
  });

  document.getElementById('filter-bakery').addEventListener('change', function () {
    activeFilters.types.bakery = this.checked;
    applyFilters();
  });

  document.getElementById('filter-butcher').addEventListener('change', function () {
    activeFilters.types.butcher = this.checked;
    applyFilters();
  });

  document.querySelectorAll('.filter-score-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-score-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-pressed', 'true');
      activeFilters.minScore = this.dataset.score || null;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', function () {
    const val = this.value.trim().toLowerCase();
    if (val.length === 0) {
      hideColoniaSuggestions();
      activeFilters.searchQuery = '';
      activeFilters.searchColonia = null;
      applyFilters();
      return;
    }
    showColoniaAutocomplete(val);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      hideColoniaSuggestions();
    }
  });

  document.addEventListener('click', function (e) {
    if (!suggestions.contains(e.target) && e.target !== searchInput) {
      hideColoniaSuggestions();
    }
  });

  clearBtn.addEventListener('click', clearAllFilters);
}

/* ---------- Autocomplete Colonias ---------- */

function showColoniaAutocomplete(query) {
  const suggestions = document.getElementById('colonia-suggestions');
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const matches = coloniasData.filter(c => {
    const name = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return name.includes(normalizedQuery);
  }).slice(0, 6);

  if (matches.length === 0) {
    hideColoniaSuggestions();
    return;
  }

  suggestions.innerHTML = matches.map(c =>
    `<li class="colonia-suggestion-item" data-lat="${c.lat}" data-lng="${c.lng}" data-name="${c.name}">
      ${c.name}${c.alcaldia ? ' — ' + c.alcaldia : ''}
    </li>`
  ).join('');

  suggestions.style.display = 'block';

  suggestions.querySelectorAll('.colonia-suggestion-item').forEach(item => {
    item.addEventListener('click', function () {
      const name = this.dataset.name;
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);

      document.getElementById('search-colonia').value = name;
      activeFilters.searchQuery = name;
      activeFilters.searchColonia = { name, lat, lng };

      hideColoniaSuggestions();
      applyFilters();

      if (filterMapRef) {
        filterMapRef.setView([lat, lng], 15);
      }
    });
  });
}

function hideColoniaSuggestions() {
  const suggestions = document.getElementById('colonia-suggestions');
  if (suggestions) suggestions.style.display = 'none';
}

/* ---------- Apply Filters ---------- */

const SCORE_ORDER = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'E': 0 };

function applyFilters() {
  if (!allEstablishments || allEstablishments.length === 0) return;

  const visibleEstablishments = [];

  allEstablishments.forEach(est => {
    const marker = est.marker;
    if (!marker) return;

    const typeMatch = activeFilters.types[est.type];

    let scoreMatch = true;
    if (activeFilters.minScore && est.healthLabel !== 'N/A') {
      const estScore = SCORE_ORDER[est.healthLabel] || 0;
      const minScore = SCORE_ORDER[activeFilters.minScore] || 0;
      scoreMatch = estScore >= minScore;
    } else if (activeFilters.minScore && est.healthLabel === 'N/A') {
      scoreMatch = false;
    }

    let searchMatch = true;
    if (activeFilters.searchColonia) {
      const coloniaName = est.colonia.toLowerCase();
      const searchName = activeFilters.searchColonia.name.toLowerCase();
      searchMatch = coloniaName.includes(searchName) || searchName.includes(coloniaName);
    }

    if (typeMatch && scoreMatch && searchMatch) {
      marker.setOpacity(1);
      marker.setZIndexOffset(0);
      visibleEstablishments.push(est);
    } else {
      marker.setOpacity(0.1);
      marker.setZIndexOffset(-1000);
    }
  });

  updateResultsCount(visibleEstablishments.length);
  updateEstablishmentList(visibleEstablishments);
}

/* ---------- Update UI ---------- */

function updateResultsCount(count) {
  const countEl = document.getElementById('filter-results-count');
  if (countEl) {
    countEl.textContent = `${count} resultado${count !== 1 ? 's' : ''}`;
  }
}

function updateEstablishmentList(establishments) {
  const list = document.getElementById('filter-establishment-list');
  if (!list) return;

  if (establishments.length === 0) {
    list.innerHTML = `
      <li class="filter-empty-message">
        <span>No se encontraron establecimientos con los filtros seleccionados.</span>
      </li>
    `;
    return;
  }

  list.innerHTML = establishments.map(est => `
    <li class="filter-establishment-item" data-id="${est.id}" data-lat="${est.lat}" data-lng="${est.lng}">
      <div class="filter-est-info">
        <span class="filter-est-name">${est.name}</span>
        <span class="filter-est-meta">
          <span class="filter-est-type">${est.typeName}</span>
          <span class="filter-est-score" style="background:${est.healthColor};">${est.healthLabel}</span>
        </span>
      </div>
    </li>
  `).join('');

  list.querySelectorAll('.filter-establishment-item').forEach(item => {
    item.addEventListener('click', function () {
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);
      const id = this.dataset.id;

      if (filterMapRef) {
        filterMapRef.setView([lat, lng], 17);

        const est = allEstablishments.find(e => String(e.id) === String(id));
        if (est && est.marker) {
          est.marker.openPopup();
        }
      }

      document.querySelectorAll('.filter-establishment-item').forEach(el => {
        el.classList.remove('selected');
      });
      this.classList.add('selected');
    });
  });
}

/* ---------- Clear Filters ---------- */

function clearAllFilters() {
  activeFilters.types = { supermarket: true, grocery: true, marketplace: true, convenience: true, greengrocer: true, bakery: true, butcher: true };
  activeFilters.minScore = null;
  activeFilters.searchQuery = '';
  activeFilters.searchColonia = null;

  document.getElementById('filter-supermarket').checked = true;
  document.getElementById('filter-grocery').checked = true;
  document.getElementById('filter-marketplace').checked = true;
  document.getElementById('filter-convenience').checked = true;
  document.getElementById('filter-greengrocer').checked = true;
  document.getElementById('filter-bakery').checked = true;
  document.getElementById('filter-butcher').checked = true;
  document.getElementById('search-colonia').value = '';

  document.querySelectorAll('.filter-score-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });
  document.querySelector('.filter-score-btn[data-score=""]').classList.add('active');
  document.querySelector('.filter-score-btn[data-score=""]').setAttribute('aria-pressed', 'true');

  applyFilters();
}
