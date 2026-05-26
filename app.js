const MAPTILER_KEY = "KO43aEajGhsdMubLPP2X";

const basemaps = {
  streets:   `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
};

const TYPE_MAP = [
  { key: "fountain",         match: (p) => p.amenity === "fountain",         emoji: "⛲", label: "Brunnen",             cat: "fountain"   },
  { key: "drinking_water",   match: (p) => p.amenity === "drinking_water",    emoji: "🚰", label: "Trinkwasser",         cat: "drinking"   },
  { key: "bench",            match: (p) => p.amenity === "bench",             emoji: "🪑", label: "Bank",                cat: "bench"      },
  { key: "library",          match: (p) => p.amenity === "library",           emoji: "📚", label: "Bibliothek",          cat: "building"   },
  { key: "community_centre", match: (p) => p.amenity === "community_centre",  emoji: "🏛️", label: "Gemeinschaftszentr.", cat: "building"   },
  { key: "playground",       match: (p) => p.leisure === "playground",        emoji: "🛝", label: "Spielplatz",          cat: "playground" },
  { key: "park",             match: (p) => p.leisure === "park",              emoji: "🏞️", label: "Park",                cat: "park"       },
  { key: "forest",           match: (p) => p.landuse === "forest",            emoji: "🌲", label: "Wald",                cat: "forest"     },
  { key: "water",            match: (p) => p.natural === "water",             emoji: "💧", label: "Wasserfläche",        cat: "water"      },
  { key: "river",            match: (p) => p.waterway === "river",            emoji: "🌊", label: "Fluss",               cat: "water"      },
  { key: "bus_stop",         match: (p) => p.highway === "bus_stop",          emoji: "🚌", label: "Bushaltestelle",      cat: "busstop"    },
];
const FALLBACK = { key: "other", emoji: "📍", label: "Ort", cat: "other" };

function getType(props) {
  return TYPE_MAP.find((t) => t.match(props)) || FALLBACK;
}

// Render emoji as colored canvas image – explicit emoji font stack
function emojiToImageData(emoji, size = 48) {
  const canvas = document.createElement("canvas");
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Explicit emoji font stack → prevents fallback black glyphs
  ctx.font = `${Math.floor(size * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.clearRect(0, 0, size, size);
  ctx.fillText(emoji, size / 2, size / 2 + 1);

  return ctx.getImageData(0, 0, size, size);
}

function loadEmojiImages(map) {
  [...TYPE_MAP, FALLBACK].forEach(({ key, emoji }) => {
    if (!map.hasImage(key)) {
      // Add emoji as sprite image
      map.addImage(key, emojiToImageData(emoji, 48), { pixelRatio: 2 });
    }
  });
}

function annotateGeoJSON(geojson) {
  geojson.features.forEach((f) => {
    const t = getType(f.properties);
    // Attach computed icon/category/label to feature
    f.properties._icon  = t.key;
    f.properties._cat   = t.cat;
    f.properties._label = t.label;
  });
  return geojson;
}

function buildFilter() {
  // Collect all active categories from checkboxes
  const active = Array.from(document.querySelectorAll(".filter-cb:checked"))
    .map((cb) => cb.dataset.cat);

  // If nothing selected → hide everything
  if (active.length === 0) return ["==", "_cat", "__none__"];

  // Build OR filter for all selected categories
  return ["any", ...active.map((cat) => ["==", ["get", "_cat"], cat])];
}

// Create cluster circle as canvas image
function makeClusterImage(map) {
  if (map.hasImage("cluster-circle")) return;

  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Green circle with white border
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle   = "#2d7a45";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth   = 3;
  ctx.stroke();

  map.addImage("cluster-circle", ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

let geojsonData = null;

function setupLayers(map) {
  loadEmojiImages(map);
  makeClusterImage(map);

  // Add or update POI source
  if (!map.getSource("pois")) {
    map.addSource("pois", {
      type: "geojson",
      data: geojsonData || { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,   // Disable clustering above zoom 14
      clusterRadius: 50
    });
  } else if (geojsonData) {
    map.getSource("pois").setData(geojsonData);
  }

  // --- Cluster circle layer ---
  if (!map.getLayer("clusters")) {
    map.addLayer({
      id: "clusters",
      type: "symbol",
      source: "pois",
      filter: ["has", "point_count"],
      layout: {
        "icon-image": "cluster-circle",
        "icon-size": [
          "step", ["get", "point_count"],
          0.9,   // < 10
          10,  1.1,  // 10–29
          30,  1.3   // ≥ 30
        ],
        "icon-allow-overlap": true,
      }
    });
  }

  // --- Cluster count text ---
  if (!map.getLayer("cluster-count")) {
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "pois",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 13,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff"
      }
    });
  }

  // --- Individual POIs ---
  if (!map.getLayer("pois-layer")) {
    map.addLayer({
      id: "pois-layer",
      type: "symbol",
      source: "pois",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "_icon"],
        "icon-size": 1,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      filter: ["all",
        ["!", ["has", "point_count"]],
        buildFilter()
      ]
    });
  }
}

function attachPopup(map) {
  const popup = new maplibregl.Popup({ closeButton: false, offset: 14, maxWidth: "240px" });

  // Click on cluster → zoom into cluster
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;

    map.getSource("pois").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  });

  // Click on individual POI → show popup
  map.on("click", "pois-layer", (e) => {
    const props  = e.features[0].properties;
    const coords = e.features[0].geometry.coordinates.slice();
    const t      = getType(props);
    const name   = props.name || props.ref || "Unbenannter Ort";

    const extra = [];
    if (props.opening_hours) extra.push(`🕐 ${props.opening_hours}`);
    if (props.wheelchair === "yes") extra.push("♿ Rollstuhlgerecht");
    if (props.website) extra.push(`<a href="${props.website}" target="_blank">🔗 Website</a>`);
    if (props.leaf_type) extra.push(`🍃 Laubtyp: ${props.leaf_type}`);

    popup.setLngLat(coords).setHTML(`
      <div style="font-family:sans-serif;font-size:13px;line-height:1.6">
        <div style="font-size:24px;text-align:center;margin-bottom:2px">${t.emoji}</div>
        <strong>${name}</strong><br>
        <span style="color:#666">📌 ${t.label}</span>
        ${extra.length ? "<hr style='margin:5px 0;border-color:#eee'>" + extra.join("<br>") : ""}
      </div>
    `).addTo(map);
  });

  // Cursor changes
  map.on("mouseenter", "clusters",   () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "clusters",   () => { map.getCanvas().style.cursor = ""; });
  map.on("mouseenter", "pois-layer", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "pois-layer", () => { map.getCanvas().style.cursor = ""; });
}

// --- Initialize map ---
const map = new maplibregl.Map({
  container: "map",
  style: basemaps.streets,
  center: [8.8, 49.39],
  zoom: 13,
  pitch: 45,
  bearing: -17.6,
  canvasContextAttributes: { antialias: true }
});

// Add controls
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }));
map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }));

map.on("load", () => {
  fetch("data/pois.geojson")
    .then((r) => r.json())
    .then((raw) => {
      geojsonData = annotateGeoJSON(raw);
      setupLayers(map);
      attachPopup(map);
    })
    .catch((err) => console.error("GeoJSON load error:", err));
});

// Basemap switcher
document.getElementById("basemap-select").addEventListener("change", (e) => {
  map.setStyle(basemaps[e.target.value]);
  map.once("styledata", () => setupLayers(map));
});

// Filter checkboxes
document.querySelectorAll(".filter-cb").forEach((cb) => {
  cb.addEventListener("change", () => {
    if (map.getLayer("pois-layer")) {
      map.setFilter("pois-layer", ["all",
        ["!", ["has", "point_count"]],
        buildFilter()
      ]);
    }
  });
});
