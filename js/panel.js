/* ========================================
   Panel de Información Nutricional
   Lógica: abrir, cerrar, datos, gráficas
   ======================================== */

let activeChart = null;
let activeRadarChart = null;

/* ---------- DOM del panel ---------- */

function createPanelDOM() {
  if (document.getElementById('nutrition-panel')) return;

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  overlay.id = 'panel-overlay';

  const panel = document.createElement('div');
  panel.className = 'nutrition-panel';
  panel.id = 'nutrition-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <h2>Información Nutricional</h2>
      <button class="btn-close" id="btn-close-panel" aria-label="Cerrar panel">&times;</button>
    </div>
    <div class="panel-body" id="panel-body">
      <div class="panel-empty">
        <p>Seleccioná un establecimiento en el mapa para ver su información.</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  document.getElementById('btn-close-panel').addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
}

function openPanel() {
  createPanelDOM();
  document.getElementById('panel-overlay').classList.add('active');
  document.getElementById('nutrition-panel').classList.add('active');
}

function closePanel() {
  const overlay = document.getElementById('panel-overlay');
  const panel = document.getElementById('nutrition-panel');
  if (overlay) overlay.classList.remove('active');
  if (panel) panel.classList.remove('active');
  destroyCharts();
}

function destroyCharts() {
  if (activeChart) { activeChart.destroy(); activeChart = null; }
  if (activeRadarChart) { activeRadarChart.destroy(); activeRadarChart = null; }
  if (typeof destroyCompareChart === 'function') destroyCompareChart();
}

/* ---------- Loading state ---------- */

function showPanelLoading() {
  const body = document.getElementById('panel-body');
  body.innerHTML = `
    <div class="panel-loading">
      <div class="spinner-large"></div>
      <p>Cargando datos nutricionales...</p>
    </div>
  `;
}

function showPanelError(msg) {
  const body = document.getElementById('panel-body');
  body.innerHTML = `
    <div class="panel-empty">
      <p>${msg}</p>
    </div>
  `;
}

/* ---------- Calcular datos de nutrientes promedio ---------- */

function getAverageNutrients(products) {
  const keys = {
    calories_100g: 'Calorías (kcal)',
    sugars_100g: 'Azúcar (g)',
    fat_100g: 'Grasa (g)',
    sodium_100g: 'Sodio (mg)',
    proteins_100g: 'Proteína (g)'
  };

  const totals = {};
  const counts = {};

  for (const p of products) {
    const nm = p.nutriments;
    if (!nm) continue;
    for (const key of Object.keys(keys)) {
      const val = nm[key];
      if (val !== undefined && val !== null) {
        totals[key] = (totals[key] || 0) + val;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  const result = {};
  for (const key of Object.keys(keys)) {
    result[key] = {
      label: keys[key],
      value: counts[key] ? Math.round((totals[key] / counts[key]) * 10) / 10 : 0,
      hasData: counts[key] > 0
    };
  }
  return result;
}

/* ---------- Valores diarios de referencia ---------- */

const DAILY_VALUES = {
  calories_100g: 2000,
  sugars_100g: 50,
  fat_100g: 65,
  sodium_100g: 2300,
  proteins_100g: 50
};

/* ---------- Renderizar panel ---------- */

function renderPanel(establishment, health, products) {
  const body = document.getElementById('panel-body');
  const nutrients = getAverageNutrients(products || []);

  const hsLabel = health ? health.label : 'N/A';
  const hsColor = health ? getHealthScoreColor(health.label) : '#6b7280';
  const hsProductCount = health ? health.productCount : 0;

  // Tabla de nutrientes
  let nutrientsRows = '';
  for (const [key, data] of Object.entries(nutrients)) {
    const pct = DAILY_VALUES[key] ? Math.min((data.value / DAILY_VALUES[key]) * 100, 100) : 0;
    const barColor = pct < 25 ? '#22c55e' : pct < 50 ? '#3b82f6' : pct < 75 ? '#eab308' : '#ef4444';
    nutrientsRows += `
      <tr>
        <td>${data.label}</td>
        <td>${data.hasData ? data.value : '—'}</td>
        <td>${data.hasData ? `<span class="nutrient-bar" style="width:${pct}%;background:${barColor};"></span>` : ''}</td>
      </tr>
    `;
  }

  body.innerHTML = `
    <div class="panel-info">
      <p class="establishment-name">${establishment.name}</p>
      <p class="establishment-type">${establishment.type}</p>
      <p class="establishment-address">${establishment.address}</p>
    </div>

    <div class="health-score-section">
      <div class="health-gauge" style="background:${hsColor};">${hsLabel}</div>
      <span class="health-label">Health Score</span>
      <span class="health-product-count">${hsProductCount} productos analizados</span>
    </div>

    <div class="nutrients-section">
      <h3>Nutrientes por 100g</h3>
      <table class="nutrients-table">
        <thead>
          <tr><th>Nutriente</th><th>Valor</th><th></th></tr>
        </thead>
        <tbody>${nutrientsRows}</tbody>
      </table>
    </div>

    <div class="charts-section">
      <h3>Distribución de Nutrientes</h3>
      <div class="chart-container">
        <canvas id="chart-bars"></canvas>
      </div>
    </div>

    <div class="charts-section">
      <h3>Perfil vs. Valores Diarios</h3>
      <div class="chart-container">
        <canvas id="chart-radar"></canvas>
      </div>
    </div>
  `;

  renderBarChart(nutrients);
  renderRadarChart(nutrients);
}

/* ---------- Gráfica de barras ---------- */

function renderBarChart(nutrients) {
  const ctx = document.getElementById('chart-bars');
  if (!ctx) return;

  const labels = [];
  const values = [];
  const colors = [];

  const barColors = ['#ef4444', '#eab308', '#f97316', '#3b82f6', '#22c55e'];
  let i = 0;

  for (const [key, data] of Object.entries(nutrients)) {
    if (data.hasData) {
      labels.push(data.label);
      values.push(data.value);
      colors.push(barColors[i % barColors.length]);
      i++;
    }
  }

  activeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'por 100g',
        data: values,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

/* ---------- Gráfica de radar ---------- */

function renderRadarChart(nutrients) {
  const ctx = document.getElementById('chart-radar');
  if (!ctx) return;

  const labels = [];
  const actual = [];
  const recommended = [];

  for (const [key, data] of Object.entries(nutrients)) {
    if (data.hasData && DAILY_VALUES[key]) {
      labels.push(data.label);
      // Porcentaje del valor diario
      actual.push(Math.round((data.value / DAILY_VALUES[key]) * 100));
      recommended.push(100);
    }
  }

  activeRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Producto',
          data: actual,
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: '#3b82f6',
          pointBackgroundColor: '#3b82f6',
          borderWidth: 2
        },
        {
          label: 'Recomendado (100%)',
          data: recommended,
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderColor: '#22c55e',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          max: 150,
          ticks: { stepSize: 50 }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 12 } }
        }
      }
    }
  });
}

/* ---------- Función principal: abrir panel con datos ---------- */

async function openNutritionPanel(establishment) {
  createPanelDOM();
  openPanel();
  showPanelLoading();

  try {
    const health = await getHealthForEstablishment(establishment.typeCode);
    const categories = ESTABLISHMENT_CATEGORY_MAP[establishment.typeCode] || ['grocery'];
    const allProducts = [];

    for (const cat of categories) {
      const products = await searchProductsByCategory(cat, 10);
      allProducts.push(...products);
    }

    renderPanel(establishment, health, allProducts);
  } catch (err) {
    console.error('Error cargando datos nutricionales:', err);
    showPanelError('No encontramos información del producto. Intenta con otro establecimiento.');
  }
}
