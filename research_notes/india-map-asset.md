# India map asset — licence and GoI-compliance audit

Date: 2026-11-03. Verified by downloading each npm tarball into
`/tmp/.../scratchpad/maps` and parsing the geometry statically (bounding boxes +
feature-name lists). No guessing: anything unverified is flagged below.

## Compliance test used

- **Internal divisions:** 36 features = 28 states + 8 UTs; `Ladakh` present
  (2019); `Dadra and Nagar Haveli and Daman and Diu` as one feature (2020);
  `Telangana` separate (2014).
- **External boundary:** the GoI depiction reaches **~37.1 N** (Gilgit-Baltistan)
  and **~80.4 E** (Aksai Chin). An OSM/Natural-Earth "on the ground" map stops
  at ~35.7 N / ~79.5 E. So the national bbox is a reliable discriminator.

## Ranked results

| # | Asset | Licence | Ladakh | Ext. boundary | Install |
|---|---|---|---|---|---|
| 1 | **vardhan-maps** `0.19.0` | code **MIT**, data **ODbL 1.0** (OSM-derived) | **yes** | **yes** — bbox 68.177/6.756 → **97.395/37.092**; Ladakh [72.506, 32.336, **80.429, 37.092**] (Gilgit-Baltistan + Aksai Chin); J&K west to 73.39 (PoK) | `npm i vardhan-maps` |
| 2 | `@amcharts/amcharts5-geodata` `5.1.6`, file `india2023Low/High` | "Free amCharts license" — linkware: commercial use **only if** the amCharts branding link stays visible; otherwise buy a licence | **yes** | **yes** — bbox 68.27/6.813 → 97.415/**37.052**; Ladakh `IN-LK` [72.616, 32.343, **80.249, 37.052**] | `npm i @amcharts/amcharts5-geodata` |
| 3 | `@highcharts/map-collection` `2.3.3`, `countries/in/in-all.geo.json` | **requires a paid Highcharts Maps licence** (LICENSE.md); data from OSM | yes (`in-la`) | **no** — bbox stops at **35.637 N / 97.396 E**; Ladakh [75.366, 32.337, **79.461, 35.637**] → no PoK, no Aksai Chin | n/a |
| 4 | `@svg-maps/india` `2.0.0` | **CC BY 4.0** (clean) | **no** | not assessed (SVG, pre-2019) | n/a |
| 5 | `react-india-states-map` `1.0.0` | MIT | **no** (no Ladakh string in bundle) | no | n/a |

Not on npm at all (404): `india-geojson`, `react-india-map`, `india-map-data`,
`india-atlas`, `india-topojson`, `india-states-geojson`, `bharat-geojson`.

### amCharts variant map (checked, for the record)

- `indiaLow/High` — 36 features but **no Ladakh**, DNH and Daman & Diu still
  separate. Pre-2019. Do not use.
- `india2019*` — 37 features, Ladakh added, DNH/DD still separate.
- `india2020*` — 36, Ladakh + "Dadra and Nagar Haveli and Daman and Diu".
- `india2023*` — 36, Ladakh + "Dadra and Nagar Haveli and Diu and Daman". **Current.**
- `worldIndiaLow/High/Ultra` and `region/world/asiaIndia*` — India-centric world
  maps, India as one feature, bbox to 37.022 N: compliant but country-level only,
  no state geometry.

## GitHub

`gh api search/*` works; **`gh api repos/<any>/...` returns 403** ("GitHub access
to this repository is not enabled for this session") and `add_repo` was denied by
the permission classifier, so repo file contents could only be read through
`search/code` text-match fragments.

- **`AbhinavSwami28/india-official-geojson`** — MIT, 6 stars. README explicitly
  claims PoK, Aksai Chin, Ladakh as separate UT, Arunachal as Indian, derived
  from `india-in-data/kashmir` and aligned to Survey of India. **FLAGGED: not
  verified.** Its own README/preview say "28 States + 4 Union Territories", which
  is wrong (there are 8 UTs), so the internal divisions are doubtful. Geometry
  not readable from this session.
- `drguptavivek/soi-geojson` — real Survey of India derivative, but its own
  README states: *"Survey of India redistribution terms for the derived GeoJSON
  remain unconfirmed... Public availability does not establish permission to
  reuse or redistribute."* Code is MIT but the LICENSE **explicitly excludes**
  `geojson/`. **Not shippable.**
- `datta07/INDIAN-SHAPEFILES` (MIT, 258 stars) — contents unreadable (403).
- Many small repos (`Subhash9325/GeoJson-Data-of-Indian-States`,
  `adarshbiradar/maps-geojson`, `inosaint/StatesOfIndia`, `MamataCSE/StatesOfIndia`)
  have **no licence** at all or are openly GADM-derived (GADM is
  non-commercial). All disqualified.

## data.gov.in / Survey of India

**Blocked by this session's proxy** — `curl` to `www.data.gov.in`,
`api.data.gov.in`, `surveyofindia.gov.in` and `onlinemaps.surveyofindia.gov.in`
all returned HTTP `000` (no connection). Nothing established first-hand.
What is known from the `soi-geojson` repo above: the Survey of India PAN-India
state/district/sub-district shapefile archive exists and is obtainable, but the
archive carried **no licence statement**, and that maintainer could not confirm
redistribution terms. Treat SoI data as **not cleared for redistribution** until
the firm gets written permission; SoI's own policy historically requires a
licence agreement for digital data, and the NDSAP/GODL-India terms that cover
data.gov.in datasets are not automatically the terms for SoI map products.

## Recommendation

```bash
npm i vardhan-maps
```

```ts
import { states, getState, loadStates, meta } from "vardhan-maps/data";
// meta.goiBordersPatched === true
```

Data files inside the package (ESM, content-hashed; reach them through the
`vardhan-maps/data` entry point rather than by path):

- `node_modules/vardhan-maps/dist/data/index.js` — public entry point
- `node_modules/vardhan-maps/dist/chunk-YNUPWOKI.js` — holds
  `src/data/generated/states.low.json`, the eager 36-feature state FeatureCollection
- `node_modules/vardhan-maps/dist/states.high-OF6FOGJQ.js` — high-res outlines
- per-state district chunks, e.g. `dist/ladakh-DJ2L4EHR.js`, loaded lazily

### Obligations we take on

1. **ODbL attribution.** Any screen showing this geometry must carry
   "© OpenStreetMap contributors" linking to
   https://www.openstreetmap.org/copyright. Put it in the map component's
   footer/credit line, not buried in a licences page.
2. **Keep the MIT notice** for the code.
3. Share-alike only bites if we publish an *adapted database*. Rendering maps in
   the app is a Produced Work — attribution only, no share-alike.
4. The package's own ATTRIBUTION.md disclaims survey-grade accuracy ("not an
   official map of India"). Fine for a dashboard; do **not** use it on anything
   filed with a regulator or printed as an authoritative map.

### Fallback

`@amcharts/amcharts5-geodata` → `json/india2023Low.json` is equally compliant and
independently verified. Only take it if we are willing either to display the
amCharts branding link or to buy an amCharts commercial licence; its linkware
terms also expect the geodata to be used with the amCharts 5 library, so pulling
the JSON into d3/react-simple-maps is outside the intended grant. Have counsel
look at it before relying on it.
