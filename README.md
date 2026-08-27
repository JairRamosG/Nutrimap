# NutriMap

Mapa saludable de CDMX. Descubrí dónde comer sano: visualizá establecimientos, zonas de calor y el acceso a comida sana por colonia.

## Características

- Mapa interactivo de establecimientos en la CDMX (Leaflet + OpenStreetMap).
- **Health Score** por establecimiento a partir del Nutri-Score promedio de sus productos.
- **Heatmap de salud por colonia** (rojo = comida chatarra, verde = saludable, gris = sin datos).
- Panel de información nutricional y gráficas de Chart.js con datos reales.
- Buscador inteligente, filtros en tiempo real y diseño mobile-first.

## Stack

- HTML5 + CSS3 + JavaScript vanilla.
- Leaflet.js + Leaflet.heat (mapas y zonas de calor).
- Chart.js (gráficas, vía CDN).
- OpenStreetMap (Overpass API) + Open Food Facts API.
- Docker multi-stage (build → nginx) y deploy con GitHub Actions → GitHub Pages.

## Cómo ejecutar

```bash
npm install
npm start        # Abre en el navegador (localhost:8080)

# Docker
docker build -t nutrimap .
docker run -p 8080:80 nutrimap

# Tests (tests unitarios vanilla, sin framework)
node test/colonia.test.js
node test/heatmap.test.js
```

## Deploy

El sitio se despliega automáticamente mediante GitHub Actions cuando se hace `push` a `main`:

1. **Build**: instala dependencias (`npm ci`) y ejecuta `npm run build` para generar `dist/`.
2. **Publish**: sube `dist/` como artefacto y lo publica en GitHub Pages con `actions/deploy-pages@v4`.
3. También permite ejecución manual desde **Actions → Deploy NutriMap to GitHub Pages → Run workflow**.

La fuente de GitHub Pages debe estar configurada en **Settings → Pages → Source: GitHub Actions**.

URL final: https://jairramosg.github.io/Nutrimap/

## APIs

### OpenStreetMap — Overpass API

```bash
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d 'data=[out:json];area["name"="Ciudad de México"]->.cdmx;(node["shop"="supermarket"](area.cdmx);node["shop"="grocery"](area.cdmx);node["amenity"="marketplace"](area.cdmx););out body;'
```

### Open Food Facts — API v2

```bash
# Producto por código de barras
curl "https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name,nutrition_grades,nutriments"

# Buscar por categoría
curl "https://world.openfoodfacts.org/api/v2/search?categories_tags_en=cereals&fields=product_name,nutrition_grades,nutriments&page_size=20"
```

## Health Score

```
Nutri-Score A = 4 puntos (más saludable)
Nutri-Score B = 3 puntos
Nutri-Score C = 2 puntos
Nutri-Score D = 1 punto
Nutri-Score E = 0 puntos (menos saludable)

Health Score del establecimiento = promedio de Nutri-Score de sus productos
```

## Estructura

```
.
├── index.html          # Página principal (rutas relativas, listo para Pages)
├── css/                # Estilos
├── js/                 # Lógica de la app (mapa, heatmap, gráficas, búsqueda, APIs)
├── data/               # Datos cacheados (colonias.json)
├── test/               # Tests unitarios vanilla Node
├── .github/workflows/  # GitHub Actions (deploy a GitHub Pages)
├── Dockerfile
└── docker-compose.yml
```

## Documentos

- `_docs/planteamiento.md` — checklist de planeación y specs.
- `_docs/process.md` — flujo de trabajo de los agentes.
- `_docs/team/` — roles (PM, Engineer, QA).