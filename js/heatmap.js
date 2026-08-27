let heatLayer = null;
let heatmapActive = true;

function createHeatLayer(map, points) {
  if (heatLayer) {
    map.removeLayer(heatLayer);
  }

  heatLayer = L.heatLayer(points, {
    radius: 25,
    blur: 15,
    maxZoom: 17,
    max: 1.0,
    gradient: {
      0.0: '#00ff00',
      0.5: '#ffff00',
      1.0: '#ff0000'
    }
  }).addTo(map);

  heatmapActive = true;
  updateToggleButton();
  return heatLayer;
}

function toggleHeatmap(map) {
  if (!heatLayer) return;

  if (heatmapActive) {
    map.removeLayer(heatLayer);
    heatmapActive = false;
  } else {
    heatLayer.addTo(map);
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
      btn.title = 'Ocultar mapa de calor';
      L.DomEvent.disableClickPropagation(btn);
      btn.addEventListener('click', function () {
        toggleHeatmap(map);
      });
      return btn;
    }
  });

  new Control({ position: 'topleft' }).addTo(map);
}
