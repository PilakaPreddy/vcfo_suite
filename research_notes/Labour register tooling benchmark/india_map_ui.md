# India Map and Geographic-Selector UI Patterns for B2B Software (as of November 2026)

> Scope note and honesty caveat up front: this session's web access was partially restricted
> (several hosts — `medianama.com`, `simplemaps.com` — failed DNS resolution and could not be
> fetched directly), so some vendor licence pages and primary legal PDFs could only be reached
> through search-result summaries rather than read in full. Every such instance is flagged in
> the Gaps sections. I did **not** find NN/g or Baymard publications specifically on
> map-as-selector; that is a genuine gap, not an omission.

---

## Key Question 1: UX evidence — is a clickable map a good state selector, or does a list/dropdown/segmented control beat it?

### Takeaway
There is no high-quality published usability study that directly pits an India (or US) clickable
state map against a dropdown/list for the *selection* task. The available evidence — one formal
study of region selectors, long-standing practitioner guidance, and accessibility constraints —
points consistently in one direction: a list/dropdown/search is the reliable primary control, and
a map earns its place only as a *visual overview* of data or status, kept in sync with that
control. For a compliance product where the user knows the state name they want, the map is
decorative overhead with real accessibility cost.

### Cited Findings
- A 2024 usability test of region selectors with more than 30 options found the **dropdown
  selector performed better** on page-performance, behaviour and business indicators; the context
  was cloud-services region selection, not a state picker, so transferability is limited — [AHFE / CMS Conferences paper](https://openaccess-api.cms-conferences.org/articles/download/978-1-964867-30-4_15)
- Smashing Magazine's checkout research found **consistent usability problems with large
  country drop-downs**, and tested typing-vs-scrolling as the remedy — i.e. the fix for a long
  geographic list is type-ahead search, not a map — [Redesigning The Country Selector](https://www.smashingmagazine.com/2011/11/10/redesigning-the-country-selector/)
- Practitioner consensus in the IA/UX archives is to **offer both and synchronise them**: a
  government-office example lets users "select your state from a drop-down list or [by] clicking
  on your area in a map" — [Sigia-l archive, "Dropdown Menus listing states, regions"](https://asist-archive.ischool.illinois.edu/sigia-l/2004-June/010650.html)
- Observable community guidance describes the working hybrid as a **two-way sync**: selecting in
  the list highlights the map, clicking the map updates the list value — [Observable forum](https://talk.observablehq.com/t/a-way-to-have-2-possible-inputs-for-1-parameter/5519)
- Commercial interactive-map components ship with **CMS/manual link modes and collapse to a
  dropdown on small screens**, confirming that vendors themselves treat the map as non-viable as
  the sole input on mobile — [Interactive US Map component](https://contra.com/products/jH8Vjbga-interactive-us-map-component-with-cms-and-manual-link-modes); [Framer US interactive map](https://www.framer.com/community/marketplace/components/us-interactive-map/)
- Hover-only map interactions **break on touch**; the practitioner remedy is to design tap-first,
  and a static map "might cause issues" as a control — [UI Stack Exchange q/29116 (mirror)](https://backiee.wasmer.app/http_ui_stackexchange_com/q/29116)
- Academic map-interface usability work (Roth & Harrower, *Cartographic Perspectives* 2008) names
  **"minimalist widgets" and "lorem ipsum placeholder maps" as explicit pitfalls**, and stresses
  cascading interface complexity (simple default, depth on demand) — [Roth & Harrower 2008 (PDF)](https://geography.wisc.edu/cartography/projects/publications/RothHarrower_2008_CP.pdf)
- A study of three map portals catalogued **403 usability problems** across four categories (user
  interface, map, search operations, help and guidance) — maps are a high-defect-surface control — [Usability problems of web map sites](https://www.academia.edu/48017307/Usability_problems_of_web_map_sites)
- An evaluation of COVID-19 dashboards from cartographic and epidemiological perspectives found
  that **poorly described data variables make map patterns difficult to interpret or even
  misleading** — a map does not self-document the way a labelled list does — [AutoCarto 2020 abstract (PDF)](https://cartogis.org/docs/autocarto/2020/docs/abstracts/7g%20An%20Evaluation%20of%20COVID-19%20Dashboards%20from%20Cartographic%20and%20Epidemiological%20Perspectives.pdf)

### Inferences
- The "small target" problem is structurally worse for India than for the US: of ~36 admin-1
  units, **Delhi, Goa, Sikkim, Chandigarh, Puducherry (four non-contiguous enclaves), Lakshadweep,
  Daman & Diu / Dadra & Nagar Haveli and Andaman & Nicobar** are either sub-pixel at typical
  dashboard widths or geographically discontinuous. Several of these are high-volume compliance
  jurisdictions (Delhi, Chandigarh, Puducherry), so the *most-used* targets are the *smallest*.
  None of the sources measured this for India specifically, but WCAG 2.5.5/2.5.8 target-size
  minima (24×24 CSS px at AA in WCAG 2.2) cannot be met for these states at a map scale that fits
  a form field, which forces either a zoom interaction or off-map pin/callout labels — the same
  workaround US maps use for the New England states.
- A map is justified when the **spatial relationship is the information**: density/heatmap of
  obligations, "which regions are red this month", clustered-risk views, coverage maps. It is not
  justified when the task is "pick the state this entity is registered in", which is a known-item
  lookup where typing three letters beats any pointing task (Fitts' law, and the type-ahead
  evidence above).
- For VCFO Suite's actual job (configuring state-wise labour registers / compliance per state),
  the decision-ready recommendation is: **primary control = searchable combobox or grouped list
  with a segmented "zone" filter; optional secondary = non-interactive or lightly interactive
  India map used as a coverage/status overview on a dashboard, never as the only way to reach a
  state.**

### Gaps
- **No NN/g article on geographic selection or map-as-navigation was found.** A domain-restricted
  search of nngroup.com returned only journey-map/concept-map/treemap articles. Either no such
  article exists or it is not indexed under these terms. Do not cite NN/g for this.
- **No Baymard Institute content was retrievable** in this session.
- No A/B test or eye-tracking study comparing clickable country map vs list for *selection* was
  found; the AHFE 2024 region-selector study is the closest and is not a map comparison.
- No study found on touch-target failure rates for small Indian states specifically.

---

## Key Question 2: Hybrid patterns and named B2B examples

### Takeaway
The repeatedly recommended pattern is map-plus-synchronised-list with the list authoritative, the
map as overview, and hover/focus tooltips plus zoom-to-region for the small units. I could
**not** verify named, citable B2B SaaS products (sales-territory, logistics, insurance, telecom
coverage) using a country map as the primary filter — that part of the brief is unmet from
primary sources.

### Cited Findings
- Two-way map↔list synchronisation is the explicitly described pattern — [Observable forum](https://talk.observablehq.com/t/a-way-to-have-2-possible-inputs-for-1-parameter/5519); [Fla-shop "Map Interaction with drop-down list of states via API"](https://www.fla-shop.com/howto/map-with-dropdown)
- Esri's ArcGIS Dashboards users have an **open feature request** for single-click map selection to
  update other widgets — i.e. in a mature BI/GIS product, map-as-filter is not even a default
  capability — [Esri Community idea](https://community.esri.com/t5/arcgis-dashboards-ideas/single-click-map-selection-to-update-widgets/idc-p/1067198)
- A US-government training document exists as a dedicated **"United States Clickable Map User
  Guide"** — the need for a 1-page manual for a clickable state map is itself evidence of
  discoverability/learnability cost — [PA Enterprise clickable map user guide (PDF)](https://training.pa.gov/Enterprise-Features/Documents/United%20States%20Clickable%20Map%20User%20Guide%20-%208-14-2018.pdf)
- Adobe's clickable-image component documentation frames clickable maps as a **forms input
  pattern** requiring explicit hit-area authoring per region — [Adobe Experience League](https://experienceleague.adobe.com/en/docs/experience-manager-learn/cloud-service/forms/clickable-image-component/introduction)
- Roth & Harrower recommend **"cascading interface complexity"** and "map browsing flexibility" —
  the formal version of "overview first, zoom on demand" — [Roth & Harrower 2008 (PDF)](https://geography.wisc.edu/cartography/projects/publications/RothHarrower_2008_CP.pdf)

### Inferences
- The defensible hybrid for a compliance cockpit: **map is a read-mostly status mosaic**
  (configured / partially configured / not configured / not applicable), each state is
  focusable and announces its status, clicking it scrolls the synchronised list to that row —
  but the list alone is sufficient to do everything. This gives the "at a glance, which states
  are unconfigured" value the map is actually good at, without making the map load-bearing.

### Gaps
- **No named B2B SaaS examples verified.** Searches surfaced only generic component marketplaces
  (Framer, Contra) and Esri/Adobe documentation, not products like sales-territory or logistics
  tools using an India/country map as a filter. Treat any such example in the final report as
  unsourced unless separately verified.

---

## Key Question 3: Indian-product and government-portal examples

### Takeaway
covid19india.org is the best-documented Indian example of a state-level choropleth as a working
dashboard control, and it is described in peer-reviewed literature. I found **no** published
usability critique of it, and could not inspect GST portal / Shram Suvidha / e-Shram /
data.gov.in / India Observatory map controls directly because of network restrictions.

### Cited Findings
- covid19india.org was a **volunteer-driven crowd-sourced tracker** that reported curated data as
  "tables, trend graphics, and color-filled maps" — [PMC article](https://pmc.ncbi.nlm.nih.gov/articles/PMC7310653)
- Users wanted **drill-down on hover** rather than state-capital-only markers, i.e. the choropleth
  under-served the actual question ("where are the hotspots?") — a single forum user, weak evidence — [Team-BHP thread](https://www.team-bhp.com/forum/shifting-gears/218667-coronavirus-thread-148.html)
- A *Journal of Maps* (Dec 2023) study of state dashboards found **"little guidance for what state
  dashboards should look like or contain, leading to significant variation"**, and assessed
  whether official maps followed fundamental cartographic principles — [DOAJ listing](https://doaj.org/article/44239a4fc5d74982b8b069a5513562a7)
- Indian government *websites* do carry live map-depiction risk: a March 2026 public complaint
  called out the **MCD Delhi website for using a foreign map service that excluded PoK**, and
  asked MeitY to notice all state and central websites to use Indian map services. This is a
  citizen request, not a government action — [X/Twitter post](https://x.com/aravind/status/2033399824914264539)
- A Survey of India political map was pushed to schools by **CBSE Circular 75/2019**, instructing
  that only the latest political map of India be displayed and used — [CBSE circular (PDF)](https://cbseacademic.nic.in/web_material/Circulars/2019/75_Circular_2019.pdf)
- The **WHO dashboard** was publicly criticised in the Indian Parliament context for showing J&K
  and Arunachal Pradesh as part of Pakistan and China — showing that third-party map services
  embedded in dashboards create political exposure — [Madhyamam](https://madhyamamonline.com/amp/india/dashboard-showing-jandk-arunachal-pradesh-part-pakistan-china-says-tmc-mp-922409)

### Inferences
- The MCD Delhi and WHO incidents are the directly relevant precedent for VCFO Suite: the risk is
  **not** that a hand-drawn SVG offends, it is that an embedded third-party basemap (Google/Mapbox/
  OSM tiles) renders India's boundaries to a non-Indian convention on a page an Indian user or
  official sees. A static, self-hosted SVG you control is *lower* risk than a tiled basemap.

### Gaps
- Could not fetch and inspect GST portal, Shram Suvidha, e-Shram, data.gov.in, NIC dashboards,
  India Observatory or Swachh Bharat dashboards. Their map interactions and flaws are **unverified**.
- No published usability review or public criticism of covid19india.org's choropleth found.

---

## Key Question 4: Legal and political map constraints in India

### Takeaway
**Settled law:** depicting India's external boundaries incorrectly is a criminal offence, and the
government actively enforces it — not via fines on Indian SaaS firms so far, but via Survey of
India + MeitY notices under IT Act s.79(3)(b) that get apps removed from app stores. **Not law:**
the 2016 Geospatial Information Regulation Bill (₹100 crore / 7 years) was a draft and I found no
evidence it was enacted. The 2021 DST Guidelines liberalised mapping but left Survey of India as
the arbiter of boundary depiction and introduced a "negative list" plus Indian-Entity ownership
rules for high-accuracy data.

### Cited Findings — what is settled
- Enforcement notices cite the **Criminal Law (Amendment) Act, 1990**, which makes misrepresentation
  of India's boundaries punishable by **imprisonment up to six months, fine, or both** — [Siasat](https://www.siasat.com/govt-directs-google-to-remove-chinese-app-for-showing-wrong-map-of-india-3210250/); [Assam Tribune](https://assamtribune.com/business/govt-directs-google-to-remove-chinese-app-for-showing-wrong-map-of-india-1574819)
  - **Conflict flagged:** other coverage attributes the offence to a **1961** Act ("prosecuted under
    a 1961 act that now carries a jail term of six months") — [Scroll.in](https://scroll.in/latest/807682/scroll_in).
    The brief names the Criminal Law Amendment Act 1961; enforcement notices in 2023–2025 name the
    1990 amendment. Both may be in play (the 1961 Act as amended). **Verify against the statute
    text before asserting a year in any client-facing document.**
- **Ablo (April 2025):** MeitY together with Survey of India directed Google to remove the Chinese
  chat app Ablo from the Play Store for incorrect depiction of India's borders, invoking
  **Section 79(3)(b) of the IT Act** (loss of intermediary safe harbour) — [Social News XYZ](https://www.socialnews.xyz/2025/04/21/govt-directs-google-to-remove-chinese-app-for-showing-wrong-map-of-india/); [Hindupost](https://hindupost.in/law-policy/modi-govt-directs-google-to-remove-chinese-app-for-showing-wrong-map-of-bharat/)
- **WorldMap Quiz (July 2023):** Survey of India asked Google to block the app; the developer
  (Qbis Studio) corrected the map instead — [MediaNama 2023 (title/summary via search; page not fetchable in this session)](https://www.medianama.com/2023/07/223-survey-of-india-google-playstore-app-inaccurate-map-india/)
- **Maps.me (January 2025):** removed from Google and Apple app stores over an incorrect India map,
  under a notice citing the map offence — [MediaNama 2025 (title/summary via search; page not fetchable)](https://www.medianama.com/2025/01/223-google-apple-app-stores-remove-navigation-app-maps-me-incorrect-india-map/)
- **Twitter (2020–2021):** served a notice in Oct 2020 over a Leh geotag showing it in China; in
  2021 its careers-page map showed J&K and Ladakh as separate from India, and a police case was
  reported against then Twitter India head Manish Maheshwari — [PressReader / Hindustan Times](https://www.pressreader.com/india/hindustan-times-east-up/20210629/281505049195538)
- **Google Maps** has previously been called out for showing Kashmir as disputed land outside India — [Inc42](https://inc42.com/buzz/google-maps-displays-kashmir-as-disputed-land-outside-india)
- **OpenStreetMap will not comply:** a maintainer response to an India boundary issue states "it is
  not an error, it is on purpose; our view of India's boundaries differs from that of India" —
  decisive for asset selection — [OSM rails-dev list](https://lists.openstreetmap.org/pipermail/rails-dev/2023-May/026425.html)

### Cited Findings — the regulatory frame
- **2021 DST Geospatial Guidelines (15 Feb 2021):** removed approvals, security clearances and
  licences for generating, publishing, disseminating and digitising maps/geospatial data, replacing
  them with a **DST-notified "negative list" of attributes that may not be marked on any map**;
  compliance is by **self-certification** — [Khaitan & Co](https://khaitanco.com/thought-leaderships/New-Guidelines-on-Liberalisation-of-Acquisition-and-Production-of-Geospatial-Data); [Trilegal](https://trilegal.com/knowledge_repository/geospatial-data-guidelines-2021/); [SCC Online](https://www.scconline.com/blog/post/2021/03/04/india-geospatial-data-guidelines-2021/)
- Accuracy threshold: **1 m horizontal / 3 m vertical**. Finer-than-threshold data must be
  **owned by Indian Entities and stored in India**; Restricted Entities (incl. foreign-owned-and-
  controlled Indian companies) may only licence it from Indian Entities to serve customers in
  India — [Khaitan & Co](https://khaitanco.com/thought-leaderships/New-Guidelines-on-Liberalisation-of-Acquisition-and-Production-of-Geospatial-Data); [Nishith Desai](https://www.nishithdesai.com/SectionCategory/33/Research%20and%20Articles/12/60/60/4678/2.html)
- **National Geospatial Policy, 2022** (Cabinet approval 16 Dec 2022, notified 28 Dec 2022, DST)
  replaced the 2005 National Map Policy; it permits any private agency to make high-resolution maps
  but **Survey of India "will remain the arbiter of maps that deal with State borders and national
  boundaries"** — [My Coordinates](https://mycoordinates.org/national-geospatial-policy-2022/); [WebJosh summary](https://webjosh.com/article/survey-of-india-to-remain-the-arbiter-of-maps-that-deal-with-state-borders-and-national-boundaries-1676984561-13805); [Drishti IAS](https://www.drishtiias.com/daily-updates/daily-news-analysis/national-geospatial-policy-2022/print_manually)
- **2016 Geospatial Information Regulation Bill (draft only):** proposed ₹10 lakh–₹100 crore fines
  and up to 7 years' imprisonment for maps departing from the government-approved version, plus a
  government licence requirement before publishing a map — [Scroll.in](https://scroll.in/latest/807682/scroll_in); [Millennium Post](https://www.millenniumpost.in/7-yr-jail-rs-100-crore-fine-for-wrong-depiction-of-india-map-143190); [MapRoomBlog](https://www.maproomblog.com/2016/05/india-proposes-fines-jail-terms-for-incorrect-maps/)
- **Official Survey of India maps:** the SoI online-maps portal lists a free **Political Map of
  India** and **Outline Map of India** among free downloads — [onlinemaps.surveyofindia.gov.in FreeOtherMaps](https://onlinemaps.surveyofindia.gov.in/FreeOtherMaps.aspx)
- SoI released official external boundaries publicly in 2018, but the community position is that
  **"we are still not sure about the exact license of these maps"** — [Thejesh GN](https://thejeshgn.com/2018/11/15/download-official-external-boundaries-of-india-by-survey-of-india/); [DataMeet thread](https://groups.google.com/g/datameet/c/gRRSDXDiEeY/m/awjOutaEAgAJ)
- Wikimedia's own India state/UT map files carry a notice that **"the usage of these maps in India,
  Pakistan and China are governed by different laws that restrict depictions of boundaries other
  than what is officially recognized by the state"** — [Wikimedia-derived file page](https://bahaipedia.org/File:India_states_and_union_territories_map.svg)
- **amCharts explicitly ships an India-compliant world map**: the default world map shows the
  "UN-mandated version of borders", and "to address India's requirements, amCharts 4 comes with a
  specific version of world map, called `worldIndia*`" (e.g. `worldIndiaLow`) — [amCharts docs](https://www.amcharts.com/docs/v4/?p=181329)
- Critics note there is "no practical way to ensure that India's borders are depicted in every map
  produced or published in the country with 100 per cent accuracy" — commentary, not law — [Business World](https://businessworld.in/article/mapping-heavy-handed-governance-98531)

### Inferences
- **Practical risk assessment for a commercial Indian B2B web app:** the realistic downside is not a
  ₹100 crore fine (that Bill was never shown to be enacted). It is (a) a Survey of India / MeitY
  notice, (b) loss of intermediary protection / app-store removal for mobile distributions, (c)
  reputational and client-trust damage with a firm whose customers are Indian corporates, and (d)
  a six-month-imprisonment-grade criminal exposure for whoever publishes the map. For a web app
  sold to Indian CA/CS firms, (c) is the binding constraint.
- **Concrete compliance rule to adopt:** any India outline shipped must include **PoK (Gilgit-
  Baltistan and Pakistan-administered Kashmir) and Aksai Chin within India's boundary**, show
  **J&K and Ladakh as two separate UTs** (post-2019), and must **not** render the boundary as
  dashed/"disputed". If the product cannot confidently satisfy that, the strongest legal answer is
  **do not ship a national-boundary map at all** — which is also the strongest UX answer per
  Question 1. This converges: a non-geographic state selector is simultaneously the accessible
  choice and the zero-legal-risk choice.
- The 2021 Guidelines' 1 m / 3 m accuracy threshold is **irrelevant** to a schematic 36-polygon
  state map (accuracy there is on the order of kilometres), so the Indian-Entity / data-localisation
  provisions do not bite. What bites is the negative list and boundary depiction, which are
  qualitative, not accuracy-based.

### Gaps
- **Could not read the statute text** of the Criminal Law Amendment Act 1961 / 1990 amendment, so
  the year conflict and the exact wording of the offence are unresolved. Flag as "verify with
  counsel" in the final report.
- **Could not read the DST 2021 Guidelines PDF or the current Negative List.** Whether the negative
  list says anything that touches a schematic state map is unverified. All 2021-Guidelines detail
  above is law-firm commentary, not the primary text.
- **No evidence found either way on whether the 2016 Geospatial Information Regulation Bill was
  enacted.** Multiple searches returned only 2016 draft coverage. Treat as "lapsed/never enacted,
  unconfirmed" — and note that the 2021 Guidelines and 2022 Policy moved in the *opposite*
  (liberalising) direction, which is indirect evidence the Bill was dropped.
- **No incident found of an Indian company being fined** for a map. All verified enforcement is
  notice-and-takedown against foreign-origin apps plus the Twitter police case. The absence of
  fine precedents against Indian SaaS is itself a finding, but it is an absence-of-evidence finding.
- **Whether the SoI free Political/Outline map is licensed for commercial reuse is unverified** —
  the portal page was listed by search but not fetched, and the community consensus is that SoI
  map licensing is unclear. Do not assume the official map may be embedded in a commercial product.
- No MeitY/SoI notice against Wikipedia was found.

---

## Key Question 5: Map assets and licences

### Takeaway
No freely reusable, commercially licensed, India-official-boundary, current-admin-1 (36 units)
vector asset was verified in this session. `@svg-maps/india` is CC BY 4.0 (attribution required
in-product) but is **stale** — it lists Jammu and Kashmir without Ladakh. GADM is academic/
non-commercial only. Natural Earth is public domain but its maintainers explicitly caution about
Admin-1 outside the US. OSM-derived data will not depict India's claimed boundary by policy. The
only vendor found to ship an explicitly India-compliant boundary variant is amCharts.

### Cited Findings

| Asset | Licence (as verified) | Attribution in-product | India-official boundary? | Admin-1 currency |
|---|---|---|---|---|
| `@svg-maps/india` | **CC BY 4.0**; source credited to MapSVG | **Yes, required** | Not stated / unverified | **Stale** — lists J&K, **no Ladakh** |
| `@svg-country-maps/india` | **CC BY 4.0**, same MapSVG origin | Yes | Unverified | Near-identical to above |
| `react-svgmap-india` | **Licence not stated in package**; credits MAPSVG | Unknown | Unverified | **Does** include Ladakh (`LA`) |
| `india-map-svg` | **MIT** (React component, not the MapSVG data) | No | N/A | N/A |
| DataMeet state boundaries | **CC BY 2.5 India** (DataMeet's own statement) | Yes | Unverified | **Stale** — Telangana still part of Andhra Pradesh; several NE states pre-delimitation |
| DataMeet village boundaries | **ODbL** | Yes + share-alike | Unverified | N/A |
| geoBoundaries (via HDX, India ADM) | **ODC-ODbL** on HDX listing; vendor pages say **CC BY** | Yes | Unverified | Unverified |
| GADM | **Academic / non-commercial only**; redistribution or commercial use needs prior permission | N/A | N/A | **Disqualified for this product** |
| Natural Earth | Public domain — but maintainers say the PD sticker "holds true for all themes" only in the US, and name **Admin-1 as a layer needing extra attention** outside it | No | No (global/neutral) | Unverified |
| Wikimedia Commons India state maps | Per-file licences, varied; files carry a warning that Indian/Pakistani/Chinese law restricts non-official boundary depictions | Per file | Per file | Per file |
| amCharts | Commercial licence; ships `worldIndia*` geodata variant to "address India's requirements" vs the default UN-boundary map | Per licence | **Yes, by design, for the world map** | Unverified at India admin-1 |
| Survey of India free Political / Outline Map of India | **Licence unverified**; community says exact licence unclear | Unknown | **Yes, authoritative** | Should be current |

Sources for the table: [npm @svg-maps/india](https://npmjs.com/package/@svg-maps/india); [@svg-maps/india README on jsDelivr](https://cdn.jsdelivr.net/npm/@svg-maps/india@2.0.0/README.md); [npm @svg-country-maps/india](https://www.npmjs.com/package/@svg-country-maps/india); [npm react-svgmap-india](https://npmjs.com/package/react-svgmap-india); [pkgstats india-map-svg](https://www.pkgstats.com/pkg:india-map-svg); [DataMeet India State Boundaries](https://projects.datameet.org/maps/states); [DataMeet Indian Village Boundaries](https://projects.datameet.org/indian_village_boundaries); [HDX geoBoundaries India](https://data.humdata.org/m/dataset/geoboundaries-admin-boundaries-for-india); [atlas.co geoBoundaries](https://atlas.co/data-sources/geo-boundaries/); [GADM licence](https://gadm.org/license.html); [Natural Earth licensing post](https://www.naturalearthdata.com/?p=3348); [Wikimedia-derived file notice](https://bahaipedia.org/File:India_states_and_union_territories_map.svg); [amCharts worldIndia docs](https://www.amcharts.com/docs/v4/?p=181329); [SoI free maps portal](https://onlinemaps.surveyofindia.gov.in/FreeOtherMaps.aspx)

Additional licence conflict to flag:
- A third-party repo credits "India boundaries by DataMeet India community (**CC BY 4.0**)", which
  **conflicts** with DataMeet's own **CC BY 2.5 India** statement — [Noccarc/maps](https://github.com/Noccarc/maps) vs [DataMeet states page](https://projects.datameet.org/maps/states)
- `Tanmay53/india-state-boundries-geojson` README states **Apache 2.0**, but the upstream source of
  the geometry is not stated — a licence assertion downstream of an unknown source is not reliable — [repo README](https://github.com/Tanmay53/india-state-boundries-geojson/blob/master/README.md)
- A compilation repo lists state polygons sourced from LGD, Survey of India, Bhuvan and DataMeet
  with **no licence stated** — [india-geodata](https://yashveeeeeer.github.io/india-geodata)
- An India pincode-boundary GeoJSON is published on the government's AIKosh portal (licence terms
  not read) — [AIKosh dataset](https://aikosh.indiaai.gov.in/home/datasets/details/all_india_pincode_boundary_geo_json.html)

### Inferences
- **Currency is the sleeper problem.** Three separate reorganisations must be reflected: Telangana
  (2014), J&K→J&K + Ladakh (2019), and Daman & Diu + Dadra & Nagar Haveli merger (2020). The most
  popular free assets fail at least one: `@svg-maps/india` fails the 2019 split, DataMeet's state
  shapefiles fail the 2014 split. Any asset chosen must be **inspected feature-by-feature** against
  the current 28 states + 8 UTs list, not trusted from its README.
- **CC BY 4.0 means a visible credit in the shipped product.** For `@svg-maps/india` that is a
  real product constraint (a credit line near the map, or in an About/Legal page), and it makes the
  "free" option not actually free of consequence for a paid B2B app.
- **The clean paths are only two:** (1) licence a commercial India map from a vendor that warrants
  India-compliant boundaries (amCharts is the only one verified to ship such a variant; simplemaps
  and Highcharts could not be checked), or (2) **ship no national-boundary map** and use a
  non-geographic selector. Option (2) costs nothing and removes both the licence and the legal
  exposure.
- GADM is ruled out outright: this is a commercial product.

### Gaps
- **simplemaps India map: licence terms and price not obtained** — `simplemaps.com` failed DNS
  resolution in this session (outside allowed network domains). Its commercial licence tiers and
  whether its India map is boundary-compliant are **unverified**.
- **Highcharts Maps India map: nothing found** on its map-collection licence or its India boundary
  depiction. Genuine gap.
- **react-simple-maps + TopoJSON:** no source retrieved on its bundled world-atlas boundary
  provenance for India. Note that `world-atlas`/`topojson` default data derives from Natural
  Earth, so the Natural Earth Admin-1 caution applies, but I could not verify this chain in session.
- **geoBoundaries primary licence page not read**; HDX says ODbL, vendor summaries say CC BY. These
  are materially different (ODbL has share-alike obligations on derived databases). Resolve before use.
- Whether amCharts' `worldIndia` variant extends to **India admin-1 (state) geodata**, not just the
  world map, is unverified.
- Whether the SoI free Outline Map is redistributable in a commercial product is unverified.

---

## Key Question 6: Technical implementation and accessibility

### Takeaway
For 36 admin-1 units, inline SVG with simplified paths is the right technical choice (no d3-geo,
no charting library, no runtime projection); TopoJSON + d3-geo only pays off if you need zoom,
reprojection or multiple admin levels. Accessibility has a well-established pattern: `role="img"`
with `aria-labelledby` pointing at `<title>`+`<desc>`, plus a real HTML table as the equivalent
path — and you should **not** use `role="application"`.

### Cited Findings
- Standard pattern: give the SVG an image role and a label so assistive tech announces it as an
  image with the label as alt text; for richer content use
  `role="img" aria-labelledby="titleID descID"` referencing `<title>` and `<desc>` — [European Data Visualisation Guide, accessible SVG and ARIA](https://data.europa.eu/apps/data-visualisation-guide/accessible-svg-and-aria)
- Consequence of `role="img"`: "screen readers will **not** attempt to traverse the content of the
  SVG", reading only title and description — so per-state detail must come from elsewhere — [European Data Visualisation Guide](https://data.europa.eu/apps/data-visualisation-guide/making-svg-content-fully-accessible)
- **Table alternative is the accepted equivalent:** the Warp design system requires that "if the
  graph has more than 3 data points there should be an accessible table alternative", and the table
  "does not have to be visible" — [Warp DS screenreader criteria](https://warp-ds.github.io/docs/foundations/data-visualization/success-criteria/screenreader)
- Practical recipe: wrap the choropleth in a section and offer a collapsible **"view data as table"**
  with a caption — [ezud, accessible map geospatial design](https://ezud.com/accessible-map-geospatial-design/)
- **Avoid `role="application"`**: it "removes the screen reader's virtual cursor", so keyboard users
  lose navigation by headings, links and landmarks — [ezud](https://ezud.com/accessible-map-geospatial-design/)
- For very large maps, ApexMaps **switches off per-feature keyboard walking** and relies on a
  generated description plus the data table as the accessible path — [ApexMaps accessibility docs](https://apexcharts.com/apexmaps/docs/accessibility/)
- Highcharts exposes individual data points with `role="img"` per point — one viable alternative to
  the single-image approach — [W3C public-svga11y list](https://lists.w3.org/Archives/Public/public-svga11y/2019Nov/0000.html)
- W3C maintains a working page on **ARIA roles for charts** in SVG — [W3C wiki](https://www.w3.org/wiki/SVG_Accessibility/ARIA_roles_for_charts)
- Screen-reader support for SVG "is not universal yet" — [European Data Visualisation Guide](https://data.europa.eu/apps/data-visualisation-guide/accessible-svg-and-aria)
- Sara Soueidan's Khan Academy case study is the reference implementation for accessible SVG data
  charts (title/desc, focus management, table fallback) — [sarasoueidan.com](https://www.sarasoueidan.com/blog/accessible-data-charts-for-khan-academy-2018-annual-report)
- amCharts and AnyChart both publish accessibility/Section-508 docs for their map and chart
  components — [amCharts accessibility](https://www.amcharts.com/?p=10488); [AnyChart 508](https://docs.anychart.com/v7/Common_Settings/Accessibility_(508_section))

### Inferences
- **Recommended architecture if a map is built anyway:**
  - Inline, build-time-simplified SVG (`<path>` per state, ~36 paths). At admin-1 simplification a
    whole-India outline is typically well under 100 KB and often under 40 KB gzipped; no runtime
    projection library is needed. (Figure is an engineering estimate, **not sourced** — measure the
    chosen asset.)
  - TopoJSON + `d3-geo` only if you need zoom-to-region, a different projection, or district-level
    drill-down later. A charting library (Highcharts/amCharts) buys you accessibility plumbing and,
    in amCharts' case, an India-boundary variant — at the cost of a commercial licence and bundle
    weight.
  - Accessibility: `<svg role="img" aria-labelledby="mapTitle mapDesc">` where `mapDesc` states the
    summary ("24 of 36 states configured; 12 pending"), each state path `aria-hidden="true"`, and a
    real `<table>` (visually available via a "View as table" disclosure, not `sr-only`-only, so
    low-vision and cognitive users benefit too) carrying state name + status + a link/button to
    configure it. **The table, not the map, is the keyboard and screen-reader path.**
  - Do not put `tabindex` on 36 paths: that creates a 36-stop tab trap with no efficient escape,
    and duplicates the table. ApexMaps' decision to drop per-feature walking at scale supports this.
- **Small-unit labelling:** use leader lines to off-map labels for Delhi, Chandigarh, Goa, Sikkim,
  Daman & Diu / DNH, Puducherry, Lakshadweep, A&N — the standard cartographic solution. Do not rely
  on hover tooltips, which have no touch equivalent.
- **Colour-blind-safe "configured vs not configured":** do not encode status by hue alone (WCAG
  1.4.1 Use of Colour). Use **three redundant channels**: (1) a diverging-safe fill (e.g. light
  neutral for not-configured, saturated brand/positive for configured), (2) a **pattern/hatch fill**
  (`<pattern>` diagonal stripes for not-configured) which survives both deuteranopia and
  greyscale printing, and (3) an explicit text status in the companion table. A dot/tick glyph
  centred on larger states adds a fourth. This follows directly from the 1.4.1 requirement and
  from the cited finding that undescribed map variables become "misleading"; the specific
  three-channel recipe is my recommendation, **not** a cited source.
- VCFO Suite already has semantic design tokens (`positive`/`warning`/`danger`/`info`, `data-1..6`)
  and a contrast gate (`scripts/design-tokens-check.mjs`), so status colours should come from
  tokens and be run through that gate rather than invented for the map.

### Gaps
- **No measured file-size or render-cost benchmark** for a 36-unit India SVG vs TopoJSON+d3-geo was
  found; the size figures above are estimates and must be measured against the chosen asset.
- No source found on touch-target sizing specifically for Indian small states/UTs.
- Did not retrieve WCAG 2.2 success-criterion text (2.5.8 Target Size Minimum, 1.4.1 Use of Colour)
  directly in this session; those are cited from knowledge, not from a fetched source, and should
  be linked to w3.org in the final report.

---

## Bottom line for the decision (synthesis, flagged as inference)

1. **Do not make a clickable India map the state selector.** The UX evidence favours a searchable
   list/combobox; the accessibility and touch-target problems are structural for India's small
   states and UTs; and the published usability literature treats maps as a high-defect control.
2. **The legal risk is real but asymmetric.** The enforced offence (six months' imprisonment /
   fine, per the Criminal Law (Amendment) Act as cited in 2023–2025 SoI/MeitY notices) and the
   enforcement pattern (app-store takedowns under IT Act s.79(3)(b)) make shipping *any* India
   national-boundary depiction a compliance item that needs sign-off. The ₹100 crore figure comes
   from a 2016 **draft** Bill with no evidence of enactment. **Not shipping a boundary map removes
   the entire category of risk at zero UX cost.**
3. **If a map ships anyway**, it should be (a) a status/coverage overview, never the only control;
   (b) from a vendor that warrants India-compliant boundaries (amCharts is the only verified one) or
   a hand-verified asset including PoK and Aksai Chin inside India with J&K and Ladakh separate;
   (c) checked feature-by-feature against the current 28 states + 8 UTs; (d) implemented as
   `role="img"` inline SVG with a real companion table as the accessible path; and (e) status
   encoded in colour **plus** pattern **plus** text.
4. **Rule out immediately:** GADM (non-commercial), OSM-derived boundaries (maintainers decline to
   use India's depiction, on record), and any embedded third-party tiled basemap (the MCD Delhi and
   WHO incidents are precisely this failure mode).
