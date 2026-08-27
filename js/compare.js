/* ========================================
   Comparativa de Establecimientos
   Selección, gráfica comparativa, highlight
   ======================================== */

const MAX_COMPARE = 3;

const COMPARE_COLORS = [
  '#3b82f6',
  '#f97316',
  '#22c55e'
];

let selectedEstablishments = [];
let compareChart = null;

/* ---------- Selección ---------- */

function toggleEstablishment(establishment) {
  const idx = selectedEstablishments.findIndex(
    e => e.name === establishment.name && e.address === establishment.address
  );

  if (idx >= 0) {
    selectedEstablishments.splice(idx, 1);
  } else if (selectedEstablishments.length < MAX_COMPARE) {
    selectedEstablishments.push(establishment);
  }

  updateCompareUI();
  syncMarkerCheckboxes();
}

function removeEstablishment(establishment) {
  selectedEstablishments = selectedEstablishments.filter(
    e => !(e.name === establishment.name && e.address === establishment.address)
  );
  updateCompareUI();
  syncMarkerCheckboxes();
}

function clearSelection() {
  selectedEstablishments = [];
  updateCompareUI();
  syncMarkerCheckboxes();
}

function isEstablishmentSelected(establishment) {
  return selectedEstablishments.some(
    e => e.name === establishment.name && e.address === establishment.address
  );
}

function isSelectionFull() {
  return selectedEstablishments.length >= MAX_COMPARE;
}

/* ---------- Sidebar ---------- */

function createCompareSidebar() {
  if (document.getElementById('compare-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.className = 'compare-sidebar';
  sidebar.id = 'compare-sidebar';
  sidebar.innerHTML = `
    <div class="compare-header">
      <h3>Comparar<span class="compare-count" id="compare-count"></span></h3>
    </div>
    <ul class="compare-list" id="compare-list"></ul>
    <div class="compare-actions">
      <button class="btn-compare" id="btn-compare-go" disabled>Comparar</button>
      <button class="btn-compare-clear" id="btn-compare-clear">Limpiar</button>
    </div>
  `;
  document.body.appendChild(sidebar);

  document.getElementById('btn-compare-go').addEventListener('click', openComparison);
  document.getElementById('btn-compare-clear').addEventListener('click', clearSelection);
}

function updateCompareUI() {
  createCompareSidebar();

  const sidebar = document.getElementById('compare-sidebar');
  const list = document.getElementById('compare-list');
  const count = document.getElementById('compare-count');
  const btnCompare = document.getElementById('btn-compare-go');

  if (selectedEstablishments.length === 0) {
    sidebar.classList.remove('active');
    return;
  }

  sidebar.classList.add('active');
  count.textContent = `(${selectedEstablishments.length}/${MAX_COMPARE})`;

  list.innerHTML = selectedEstablishments.map((est, i) => `
    <li>
      <span class="compare-item-name" style="color:${COMPARE_COLORS[i]}">${est.name}</span>
      <button class="compare-item-remove" data-idx="${i}" aria-label="Quitar">&times;</button>
    </li>
  `).join('');

  list.querySelectorAll('.compare-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      removeEstablishment(selectedEstablishments[idx]);
    });
  });

  btnCompare.disabled = selectedEstablishments.length < 2;
}

/* ---------- Sincronizar checkboxes en marcadores ---------- */

function syncMarkerCheckboxes() {
  const checkboxes = document.querySelectorAll('.popup-compare-checkbox');
  checkboxes.forEach(cb => {
    const est = {
      name: cb.dataset.name,
      typeCode: cb.dataset.typecode,
      type: cb.dataset.type,
      address: cb.dataset.address
    };
    cb.checked = isEstablishmentSelected(est);
    cb.disabled = !cb.checked && isSelectionFull();
  });

  document.querySelectorAll('.marker-circle').forEach(el => {
    const name = el.dataset.estName;
    const addr = el.dataset.estAddress;
    const isSelected = selectedEstablishments.some(
      e => e.name === name && e.address === addr
    );
    const parent = el.closest('.custom-marker');
    if (parent) {
      if (isSelected) {
        parent.classList.add('marker-selected');
      } else {
        parent.classList.remove('marker-selected');
      }
    }
  });
}

/* ---------- Comparativa ---------- */

async function openComparison() {
  if (selectedEstablishments.length < 2) return;

  createPanelDOM();
  openPanel();
  showPanelLoading();

  try {
    const estData = await Promise.all(
      selectedEstablishments.map(async (est, i) => {
        const health = await getHealthForEstablishment(est.typeCode);
        const categories = ESTABLISHMENT_CATEGORY_MAP[est.typeCode] || ['grocery'];
        const allProducts = [];
        for (const cat of categories) {
          const products = await searchProductsByCategory(cat, 10);
          allProducts.push(...products);
        }
        const nutrients = getAverageNutrients(allProducts || []);
        return {
          name: est.name,
          color: COMPARE_COLORS[i],
          nutrients
        };
      })
    );

    renderComparisonPanel(estData);
  } catch (err) {
    console.error('Error cargando datos de comparativa:', err);
    showPanelError('Error al cargar datos. Intentá de nuevo.');
  }
}

function renderComparisonPanel(estData) {
  const body = document.getElementById('panel-body');

  const legendHTML = estData.map((est, i) => `
    <div class="comparison-legend-item">
      <span class="comparison-legend-color" style="background:${est.color}"></span>
      <span class="comparison-legend-name">${est.name}</span>
    </div>
  `).join('');

  body.innerHTML = `
    <div class="panel-info">
      <p class="establishment-name">Comparativa</p>
      <p class="establishment-type">${estData.length} establecimientos seleccionados</p>
    </div>

    <div class="comparison-section">
      <h3>Nutrientes por 100g</h3>
      <div class="comparison-chart-container">
        <canvas id="chart-comparison"></canvas>
      </div>
      <div class="comparison-legend">${legendHTML}</div>
      <div class="comparison-highlight-note">
        <strong>Verde</strong> = mejor valor por nutriente
        (menor para calorías/azúcar/grasa/sodio; mayor para proteína)
      </div>
    </div>
  `;

  renderComparisonChart(estData);
}

/* ---------- Gráfica comparativa ---------- */

const COMPARE_NUTRIENTS = {
  calories_100g: { label: 'Calorías (kcal)', lowerBetter: true },
  sugars_100g: { label: 'Azúcar (g)', lowerBetter: true },
  fat_100g: { label: 'Grasa (g)', lowerBetter: true },
  sodium_100g: { label: 'Sodio (mg)', lowerBetter: true },
  proteins_100g: { label: 'Proteína (g)', lowerBetter: false }
};

function renderComparisonChart(estData) {
  const ctx = document.getElementById('chart-comparison');
  if (!ctx) return;

  const labels = Object.values(COMPARE_NUTRIENTS).map(n => n.label);

  const datasets = estData.map(est => ({
    label: est.name,
    data: Object.keys(COMPARE_NUTRIENTS).map(key => est.nutrients[key]?.value || 0),
    backgroundColor: est.color + 'CC',
    borderColor: est.color,
    borderWidth: 1,
    borderRadius: 4
  }));

  const bestValues = {};
  for (const [key, info] of Object.entries(COMPARE_NUTRIENTS)) {
    const vals = estData.map(est => est.nutrients[key]?.value ?? null).filter(v => v !== null);
    if (vals.length === 0) continue;
    bestValues[key] = info.lowerBetter ? Math.min(...vals) : Math.max(...vals);
  }

  compareChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true }
      },
      animation: {
        onComplete: function () {
          const chart = this;
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data || meta.data.length === 0) return;

          const ctx2 = chart.ctx;
          ctx2.save();

          for (let d = 0; d < chart.data.datasets.length; d++) {
            const dsMeta = chart.getDatasetMeta(d);
            for (let i = 0; i < dsMeta.data.length; i++) {
              const key = Object.keys(COMPARE_NUTRIENTS)[i];
              const val = chart.data.datasets[d].data[i];
              if (bestValues[key] !== undefined && val === bestValues[key]) {
                const bar = dsMeta.data[i];
                ctx2.fillStyle = '#16a34a';
                ctx2.font = 'bold 14px sans-serif';
                ctx2.textAlign = 'center';
                ctx2.fillText('\u2713', bar.x, bar.y - 6);
              }
            }
          }

          ctx2.restore();
        }
      }
    }
  });
}

/* ---------- Cleanup ---------- */

function destroyCompareChart() {
  if (compareChart) {
    compareChart.destroy();
    compareChart = null;
  }
}

(function initCompare() {
  document.addEventListener('DOMContentLoaded', createCompareSidebar);
})();
