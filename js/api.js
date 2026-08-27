const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2';

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
  const colors = { A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', E: '#ef4444' };
  return colors[label] || '#6b7280';
}

async function searchProductsByCategory(category, pageSize = 20) {
  try {
    const url = `${OFF_BASE_URL}/search?categories_tags_en=${encodeURIComponent(category)}&fields=product_name,nutrition_grades,nutriments&page_size=${pageSize}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch {
    return [];
  }
}

async function getProductByBarcode(barcode) {
  try {
    const url = `${OFF_BASE_URL}/product/${barcode}.json?fields=product_name,nutrition_grades,nutriments`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.product || null;
  } catch {
    return null;
  }
}

const ESTABLISHMENT_CATEGORY_MAP = {
  supermarket: ['supermarket', 'frozen-foods', 'beverages'],
  grocery: ['grocery', 'snacks', 'dairy-products'],
  marketplace: ['fresh-foods', 'fruits', 'vegetables']
};

async function getHealthForEstablishment(type) {
  const categories = ESTABLISHMENT_CATEGORY_MAP[type] || ['grocery'];
  const allProducts = [];

  for (const cat of categories) {
    const products = await searchProductsByCategory(cat, 10);
    allProducts.push(...products);
  }

  return calculateHealthScore(allProducts);
}
