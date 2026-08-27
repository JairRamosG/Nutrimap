/* Unit test para js/colonia.js (#16).
   Vanilla Node (sin deps, sin npm test): `node test/colonia.test.js`.

   colonia.js lee de los globals de markers.js (haversimeKm, getHealthSlot,
   allEstablishments) y de fetch() para data/colonias.json. Simulamos esos
   globals con datos deterministas para comprobar la fórmula, el overlap, la
   semántica "sin datos" y los guards de NaN, sin tocar la red. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const COLONIAS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'colonias.json'), 'utf8')
);

// Haversine idéntica a markers.js (collado real verificable).
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// getHealthSlot equivalente (la misma taxonomía de markers.js).
function getHealthSlot(type) {
  const map = {
    supermarket: 'mixed',
    grocery: 'mixed',
    marketplace: 'mixed',
    convenience: 'junk',
    greengrocer: 'fresh',
    bakery: 'fresh',
    butcher: 'fresh'
  };
  return map[type] || 'mixed';
}

// Estos globals se resuelven como tal en el require CJS de colonia.js.
global.haversineKm = haversineKm;
global.getHealthSlot = getHealthSlot;

// fetch local: devuelve colonias.json sin red.
global.fetch = async () => ({ json: async () => COLONIAS });

// Datos deterministas de establecimientos (la forma que produce markers.js).
const ROMA = [19.4195, -99.162];
const ESC = [19.405, -99.19];
const CON = [19.415, -99.175];
global.allEstablishments = [
  { name: 'Fresh1 Roma', lat: ROMA[0], lng: ROMA[1], type: 'greengrocer' },
  { name: 'Fresh2 Roma', lat: ROMA[0], lng: -99.1608, type: 'bakery' },
  { name: 'Super Roma', lat: 19.4192, lng: -99.163, type: 'supermarket' },
  { name: 'Junk Esc', lat: ESC[0], lng: ESC[1], type: 'convenience' },
  { name: 'Super Condesa', lat: CON[0], lng: CON[1], type: 'supermarket' },
  // Overlap real: dentro del radio de Roma Norte Y de Roma Sur (centroides a
  // ~0.75km). Contribuye a AMBAS; no se consume ni deduplica entre colonias.
  { name: 'Fresh Overlap', lat: 19.4162, lng: -99.161, type: 'greengrocer' },
  // Fuera del radio (≈1.4km este de Roma) → NO debe contar.
  { name: 'Junk Lejos', lat: ROMA[0], lng: -99.149, type: 'convenience' }
];

const colonia = require('../js/colonia.js');

async function main() {
  const scores = await colonia.recomputeColoniaHealthScores();
  const byName = Object.fromEntries(scores.map((s) => [s.name, s]));

  // Roma Norte: 2 fresh + 1 supermarket, n=3. Score alto (0.8..0.9), no low.
  const roma = byName['Roma Norte'];
  assert(roma, 'Roma Norte presente');
  assert(roma.hasData === true, 'Roma tiene datos');
  assert.equal(roma.sampleSize, 4, 'Roma n=4 (2 fresh + supermarket + overlap fresh)');
  assert.equal(roma.lowConfidence, false, 'Roma n=3 no es low confidence');
  assert(roma.score >= 0.8 && roma.score <= 0.9, `Roma score en [0.8,0.9], fue ${roma.score}`);

  // Escandón: 1 junk en el centroide → score 0, muestra diminuta → low.
  const esc = byName['Escandón'];
  assert(esc.hasData === true, 'Escandón tiene datos');
  assert.equal(esc.score, 0, 'Escandón solo junk = 0');
  assert.equal(esc.sampleSize, 1, 'Escandón sampleSize=1');
  assert.equal(esc.lowConfidence, true, 'Escandón n=1 low confidence (no leído como señal fuerte)');

  // Condesa: 1 mixed (supermercado) en el centroide → 0.5 NEUTRO, no 0 ni 1.
  const con = byName['Condesa'];
  assert(con.hasData === true, 'Condesa tiene datos');
  assert.equal(con.score, 0.5, 'mixed contribuye NEUTRO 0.5');
  assert.equal(con.lowConfidence, true, 'Condesa n=1 low confidence');

  // Sin establecimientos cerca → null + hasData:false, NUNCA 0 ni fuerzas.
  const neza = byName['Ciudad Nezahualcóyotl'];
  assert(neza.score === null, 'Colonia sin datos → null, no 0');
  assert.equal(neza.hasData, false, 'hasData:false para sin datos');
  assert.equal(neza.sampleSize, 0, 'sampleSize=0');

  // Guard: ningún campo con NaN/Infinity; schema completo; todas las colonias.
  assert.equal(scores.length, COLONIAS.length, '88 colonias procesadas');
  for (const s of scores) {
    assert(typeof s.name === 'string' && s.name, 'name presente');
    assert(typeof s.alcaldia === 'string' && s.alcaldia, 'alcaldia presente');
    assert(typeof s.lowConfidence === 'boolean', 'lowConfidence booleano');
    assert(typeof s.hasData === 'boolean', 'hasData booleano');
    assert(Number.isInteger(s.sampleSize) && s.sampleSize >= 0, 'sampleSize entero');
    if (s.score !== null) {
      assert(s.score >= 0 && s.score <= 1, `score en 0..1 (${s.name}=${s.score})`);
      assert(Number.isFinite(s.score), `score finito (${s.name})`);
    }
  }

  // Esquema self-contained: overwrite el caché bajo demanda no rompe.
  const getter = colonia.getColoniaHealthScores();
  assert(getter.length, 'getColoniaHealthScores devuelve resultados cacheados');
  assert(Array.isArray(getter) && getter === scores, 'getter devuelve el cache');

  // Overlap: el mismo establecimiento dentro de 1km de varias colonias contribuye
  // a cada una, SIN consumirse. "Fresh Overlap" se vio dentro del radio de Roma
  // Sur (que sin él quedaría "sin datos") → Roma Sur ahora tiene datos con n=1.
  const romaSur = byName['Roma Sur'];
  assert(romaSur.hasData === true, 'Roma Sur recibe establecimientos compartidos (overlap, sin dedupe)');
  assert(romaSur.sampleSize >= 1, 'Roma Sur puntúa establecimientos compartidos desde Roma Norte');
  assert(romaSur.lowConfidence === (romaSur.sampleSize < 3), 'lowConfidence = sampleSize<3');

  // "Junk Lejos" (~1.4km, fuera del radio de Roma Norte) NO se cuenta: Roma
  // Norte mantiene n=4 (2 fresh + supermarket + overlap), no 5 (bbox/radio guard).
  assert.equal(roma.sampleSize, 4, 'El establecimiento fuera del radio no se cuenta (early-exit)');

  console.log('ALL COLONIA TESTS PASSED');
  console.log('top / junk / no-data sample:');
  console.log('  ' + scores.slice(0, 3).map((s) => `${s.name}=${s.score}(n${s.sampleSize})`).join(' | '));
  const nulls = scores.filter((s) => s.score === null);
  console.log(`  colonias sin datos: ${nulls.length}`);
  console.log(`  total colonias: ${scores.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});