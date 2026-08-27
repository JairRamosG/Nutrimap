const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2';

// Color neutro/gris explícito para score "N/A" (distinguible de A–E).
const HEALTH_NA_COLOR = '#6b7280';

// Versionado del caché persistente. Bump en cada cambio de schema.
const CACHE_VERSION = 'nutrimap-cache-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Cache en memoria de resultados resueltos (health score por clave type::brand).
const healthByKey = {};

// Promises en vuelo: comparten una sola request por clave; se eliminan al resolverse/rechazarse.
const pendingHealthPromises = {};

// Cache en memoria de respuestas genéricas de OFF (categorías / barcodes).
const nutritionCache = {};

const NUTRI_SCORE_MAP = { a: 4, b: 3, c: 2, d: 1, e: 0 };

function calculateHealthScore(products) {
  if (!products || products.length === 0) return null;

  let total = 0;
  let count = 0;

  for (const product of products) {
    const grade = (product.nutrition_grades || '').toLowerCase();
    if (grade in NUTRI_SCORE_MAP) {
      total += NUTRI_SCORE_MAP[grade];
      count++;
    }
  }

  if (count === 0) return null;

  const avg = total / count;
  const normalized = avg / 4;

  const label = normalized >= 0.7 ? 'A'
    : normalized >= 0.5 ? 'B'
    : normalized >= 0.35 ? 'C'
    : normalized >= 0.12 ? 'D'
    : 'E';

  return { score: normalized, label, productCount: count };
}

function getHealthScoreColor(label) {
  if (!label || label === 'N/A') return HEALTH_NA_COLOR;
  const colors = { A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', E: '#ef4444' };
  return colors[label] || HEALTH_NA_COLOR;
}

/* ---------- Retry / backoff ---------- */

const MAX_ATTEMPTS = 3; // 3 intentos totales, 2 reintentos
// 429/503: rate limiting/Overpass busy. 504: Overpass gateway timeout (transitorio).
const RETRYABLE_STATUS = [429, 503, 504];
const RETRYABLE_TEXT_MARKERS = [
  'too busy',
  'rate exceeded',
  'too many requests',
  'rate limited'
];

function isRetryableResponse(status, text) {
  if (RETRYABLE_STATUS.includes(status)) return true;
  if (typeof text === 'string') {
    const lower = text.toLowerCase();
    return RETRYABLE_TEXT_MARKERS.some(marker => lower.includes(marker));
  }
  return false;
}

function backoffDelay(attempt) {
  const base = 500;
  const exp = Math.pow(2, attempt - 1); // intento 1 -> 1x, intento 2 -> 2x
  return base * exp + Math.random() * 200;
}

const sleepMs = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJsonWithRetry(url, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        await sleepMs(backoffDelay(attempt));
        continue;
      }
      throw e;
    }

    const text = await res.text().catch(() => '');
    const retryable = isRetryableResponse(res.status, text);

    if (!res.ok || retryable) {
      lastError = new Error(`request failed (HTTP ${res.status})`);
      if (attempt < MAX_ATTEMPTS) {
        await sleepMs(backoffDelay(attempt));
        continue;
      }
      throw lastError;
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      lastError = new Error('invalid JSON response');
      if (attempt < MAX_ATTEMPTS) {
        await sleepMs(backoffDelay(attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}

/* ---------- Búsqueda de productos ---------- */

async function fetchCategoryProducts(category, pageSize) {
  const cacheKey = `cat_${category}`;
  if (nutritionCache[cacheKey]) {
    return { products: nutritionCache[cacheKey], failed: false };
  }

  const url = `${OFF_BASE_URL}/search?categories_tags_en=${encodeURIComponent(category)}&fields=product_name,nutrition_grades,nutriments&page_size=${pageSize}`;
  try {
    const data = await fetchJsonWithRetry(url);
    const products = data.products || [];
    // Solo se cachean resultados exitosos no vacíos: un fallo no se guarda como permanente.
    if (products.length > 0) nutritionCache[cacheKey] = products;
    return { products, failed: false };
  } catch {
    return { products: [], failed: true };
  }
}

async function searchProductsByCategory(category, pageSize = 20) {
  const { products } = await fetchCategoryProducts(category, pageSize);
  return products;
}

async function getProductByBarcode(barcode) {
  const cacheKey = `bar_${barcode}`;
  if (nutritionCache[cacheKey]) return nutritionCache[cacheKey];
  try {
    const url = `${OFF_BASE_URL}/product/${barcode}.json?fields=product_name,nutrition_grades,nutriments`;
    const data = await fetchJsonWithRetry(url);
    nutritionCache[cacheKey] = data.product || null;
    return nutritionCache[cacheKey];
  } catch {
    return null;
  }
}

/* ---------- Health score por establecimiento (brand-aware) ---------- */

const ESTABLISHMENT_CATEGORY_MAP = {
  supermarket: ['supermarket', 'frozen-foods', 'beverages'],
  grocery: ['grocery', 'snacks', 'dairy-products'],
  marketplace: ['fresh-foods', 'fruits', 'vegetables']
};

async function fetchBrandProducts(brand) {
  if (!brand) return { products: [], failed: false };
  const url = `${OFF_BASE_URL}/search?brands_tags_en=${encodeURIComponent(brand)}&fields=product_name,nutrition_grades&page_size=10`;
  try {
    const data = await fetchJsonWithRetry(url);
    return { products: data.products || [], failed: false };
  } catch {
    return { products: [], failed: true };
  }
}

async function computeHealthForKey(type, brand) {
  let anyFailed = false;

  const brandRes = await fetchBrandProducts(brand);
  if (brandRes.failed) anyFailed = true;

  // Si la marca tiene productos reales, se usa el score por marca.
  if (brandRes.products.length > 0) {
    return { result: calculateHealthScore(brandRes.products), anyFailed };
  }

  // Fallback por tipo del establecimiento (marca 0 productos o falló la consulta).
  const categories = ESTABLISHMENT_CATEGORY_MAP[type] || ['grocery'];
  const allProducts = [];

  for (const cat of categories) {
    const { products, failed } = await fetchCategoryProducts(cat, 10);
    if (failed) anyFailed = true;
    allProducts.push(...products);
  }

  const fallbackResult = calculateHealthScore(allProducts);
  if (fallbackResult) {
    return { result: fallbackResult, anyFailed };
  }

  // N/A: sin productos gradeables. Se cachea como válido solo si ninguna petición falló;
  // si hubo fallo de red, NO se cachea para poder reintentar más adelante.
  return { result: null, anyFailed };
}

function buildHealthKey(type, brand) {
  return `${type}::${(brand || '').trim()}`;
}

async function getHealthForEstablishment(type, brand) {
  const key = buildHealthKey(type, brand);

  if (healthByKey[key] !== undefined) return healthByKey[key];
  if (pendingHealthPromises[key]) return pendingHealthPromises[key];

  const promise = (async () => {
    const { result, anyFailed } = await computeHealthForKey(type, (brand || '').trim());
    if (!anyFailed) {
      healthByKey[key] = result;
    }
    return result;
  })().catch(() => {
    // Rechazo (red/429/503/Overpass busy): no se cachea; una llamada posterior reintenta.
    return null;
  }).finally(() => {
    delete pendingHealthPromises[key];
  });

  pendingHealthPromises[key] = promise;
  return promise;
}