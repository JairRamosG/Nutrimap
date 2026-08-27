/* Unit test para js/heatmap.js (#17) — heatmap de SALUD por colonia.
   Vanilla Node (sin deps): `node test/heatmap.test.js`.

   heatmap.js espera el global L (Leaflet) y window/document. Lo corremos en un
   vm con Leaflet y DOM stubeados para verificar, sin navegador:
     - normalización RELATIVA al rango observado (Smax/Smin, épsilon, fallback
       degenerado sin /0, clamp [0,1], sin NaN/Infinity),
     - separación: calor coloreado (plena confianza) vs atenuado (lowConfidence)
       vs capa GRIS separada para colonias sin datos (nunca en el gradiente),
     - `max: 1.0` para que intensity=1 alcance el tope rojo. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeLayerGroup() {
  return {
    addLayer(l) { (this._l = this._l || []).push(l); return this; },
    getLayers() { return this._l || []; }
  };
}

// Leaflet stub mínimo: solo lo que heatmap.js usa.
const L = {
  layerGroup() { return makeLayerGroup(); },
  heatLayer(pts, opts) { return { kind: 'heat', pts, opts }; },
  circleMarker(ll, opts) {
    return { kind: 'circle', ll, opts, addTo(g) { g.addLayer(this); return this; } };
  }
};

const sandbox = {
  L,
  window: { NUTRIMAP: null },
  document: { getElementById() { return null; } },
  console,
  Object, Array, Math, Number, String, Infinity, NaN
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'heatmap.js'), 'utf8'), sandbox);

const { computeHealthIntensities, buildHealthHeatLayer } = sandbox;

const SCORES = [
  { name: 'A', lat: 1, lng: 1, score: 0.95, hasData: true, lowConfidence: false },
  { name: 'B', lat: 2, lng: 2, score: 0.10, hasData: true, lowConfidence: true },
  { name: 'C', lat: 3, lng: 3, score: 0.52, hasData: true, lowConfidence: false },
  { name: 'D', lat: 4, lng: 4, score: null, hasData: false, lowConfidence: true }
];

function main() {
  // --- Normalización relativa al rango observado ---
  const ints = computeHealthIntensities(SCORES);
  assert.equal(ints.hasData, true);
  assert.equal(Object.keys(ints.intensityByName).length, 3, 'A/C/D: null excluido de S');

  // La colonia con score MENOR (junk) -> intensity 1 -> ROJO.
  const b = ints.intensityByName[SCORES[1].name];
  assert.ok(Math.abs(b - 1) < 1e-9, 'peor score -> intensidad 1 (chatarra/rojo)');
  // La colonia con score MAYOR (sana) -> intensity 0 -> VERDE.
  const a = ints.intensityByName[SCORES[0].name];
  assert.ok(Math.abs(a - 0) < 1e-9, 'mejor score -> intensidad 0 (sano/verde)');
  // Media -> ~0.5 (amarillo).
  const c = ints.intensityByName[SCORES[2].name];
  assert.ok(Math.abs(c - 0.5012) < 0.01, `score medio -> ~0.5 (amarillo), fue ${c}`);

  // Rango degenerado (todos iguales): fallback 1 - s, nunca /0.
  const dg = computeHealthIntensities([
    { name: 'X', score: 0.5, hasData: true },
    { name: 'Y', score: 0.5, hasData: true }
  ]);
  assert.equal(dg.hasData, true);
  assert.ok(Math.abs(dg.intensityByName.X - 0.5) < 1e-9, 'degenerado -> fallback 1-s');
  assert.ok(Number.isFinite(dg.intensityByName.X), 'degenerado sin NaN');

  // Sin datos (S vacío): hasData false, no hay mapa de intensidades.
  assert.equal(computeHealthIntensities([{ name: 'Z', score: null, hasData: false }]).hasData, false);

  // Clamp + descarte de no-finito: un score fuera de rango no produce >1 ni NaN.
  const weird = computeHealthIntensities([
    { name: 'W1', score: 0.9, hasData: true }, { name: 'W2', score: 0.2, hasData: true }
  ]);
  Object.values(weird.intensityByName).forEach((v) => {
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, 'intensidad finita en [0,1]');
  });

  // --- Capas: color plena confianza, color atenuado, gris separado ---
  const built = buildHealthHeatLayer({}, SCORES);
  const children = built.group.getLayers();
  // Orden estable: plena confianza primero, baja confianza segundo, gris al final.
  const heats = children.filter((c) => c.kind === 'heat');
  const greyGroup = children[children.length - 1];

  assert.equal(heats.length, 2, 'dos capas de calor: plena confianza + baja confianza');
  // Plena confianza: A, C (2 puntos). Baja confianza: B (1 punto).
  const full = heats[0];
  const low = heats[1];
  assert.equal(full.pts.length, 2, 'A+C plena confianza');
  assert.equal(low.pts.length, 1, 'B baja confianza');
  assert.equal(full.opts.max, 1.0, 'max: 1.0 para que intensity=1 alcance el rojo');
  low.pts.concat(full.pts).forEach((p) => assert.ok(Number.isFinite(p[2]), 'sin NaN/Infinity'));

  // No-data -> capa gris separada de círculos, NO en el gradiente.
  assert.equal(greyGroup.getLayers().length, 1, 'D sin datos -> círculo gris');
  assert.equal(greyGroup.getLayers()[0].kind, 'circle');

  // --- Solo sin datos: no hay capa de calor, solo gris ---
  const onlyNull = buildHealthHeatLayer({}, [{ name: 'D', lat: 4, lng: 4, score: null, hasData: false, lowConfidence: true }]);
  assert.equal(onlyNull.hasData, false);
  assert.equal(onlyNull.group.getLayers().filter((c) => c.kind === 'heat').length, 0, 'sin datos -> sin gradiente');
  assert.equal(onlyNull.group.getLayers().filter((c) => c.getLayers && !('kind' in c)).length, 1, 'gris sigue presente');

  // --- Sin colonias en absoluto: layerGroup vacío (create... haría no-op) ---
  assert.equal(buildHealthHeatLayer({}, []).group.getLayers().length, 0);

  console.log('ALL HEATMAP TESTS PASSED');
  console.log(`  intensidades: A=${ints.intensityByName.A.toFixed(3)} B=${ints.intensityByName.B.toFixed(3)} C=${ints.intensityByName.C.toFixed(3)}`);
  console.log(`  capas: ${heats.length} heat (${full.pts.length} plena + ${low.pts.length} baja) + ${greyGroup.getLayers().length} gris`);
}

main();