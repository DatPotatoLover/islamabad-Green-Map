/* Islamabad Green Spaces Web GIS
   API: Overpass API (OpenStreetMap)
   Features: fetch JSON, map markers/popups, search, category filter, status/error handling.
*/

"use strict";

// Approximate map center for Islamabad.
const map = L.map("map").setView([33.6844, 73.0479], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const statusElement = document.getElementById("status");
const countElement = document.getElementById("count");
const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");
const loadButton = document.getElementById("loadButton");

let greenSpaces = [];
let requestInProgress = false;

// Translate OpenStreetMap leisure tags into readable labels.
const categoryLabels = {
  park: "Park",
  garden: "Garden",
  playground: "Playground",
  recreation_ground: "Recreation ground"
};

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = "status-message";
  if (kind) statusElement.classList.add(kind);
}

// Escape API-provided text before placing it in popup HTML.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getCoordinates(element) {
  // Nodes have lat/lon; ways and relations can have a center with out center.
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function buildPopup(feature) {
  const readableType = categoryLabels[feature.type] || feature.type.replaceAll("_", " ");
  return `
    <strong class="popup-title">${escapeHTML(feature.name)}</strong>
    <p class="popup-detail"><strong>Type:</strong> ${escapeHTML(readableType)}</p>
    <p class="popup-coordinates">Latitude: ${feature.latitude.toFixed(5)}</p>
    <p class="popup-coordinates">Longitude: ${feature.longitude.toFixed(5)}</p>
    <p class="popup-coordinates">Source: OpenStreetMap</p>
  `;
}

// Overpass bounding box: south, west, north, east.
// This covers Islamabad and nearby areas; it is not an official administrative boundary.
function createOverpassURL() {
  const query = `
    [out:json][timeout:25];
    (
      nwr["leisure"~"^(park|garden|playground|recreation_ground)$"](33.5,72.7,33.9,73.4);
    );
    out center;
  `;
  return "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
}

async function loadData() {
  if (requestInProgress) return;

  requestInProgress = true;
  loadButton.disabled = true;
  setStatus("Loading green spaces from the Overpass API…");
  countElement.textContent = "Loading features…";

  try {
    const response = await fetch(createOverpassURL(), {
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`The API returned HTTP ${response.status}.`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.elements)) {
      throw new Error("The API response did not contain the expected feature list.");
    }

    const parsed = data.elements.map(element => {
      const coordinates = getCoordinates(element);
      if (!coordinates) return null;

      return {
        id: `${element.type}/${element.id}`,
        name: element.tags?.name || "Unnamed green space",
        type: element.tags?.leisure || "other",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      };
    }).filter(Boolean);

    // Keep only the categories offered in the interface.
    greenSpaces = parsed.filter(feature =>
      Object.prototype.hasOwnProperty.call(categoryLabels, feature.type)
    );

    renderFeatures();

    if (greenSpaces.length === 0) {
      setStatus("The API responded, but no matching features were found. Try again later.", "warning");
    } else {
      setStatus(`Successfully loaded ${greenSpaces.length} green spaces from OpenStreetMap.`);
    }
  } catch (error) {
    console.error("Unable to load Overpass data:", error);
    setStatus(
      "Could not load data. Check your internet connection or try again later; the public API may be busy.",
      "error"
    );
    countElement.textContent = `${greenSpaces.length} previously loaded features`;
  } finally {
    requestInProgress = false;
    loadButton.disabled = false;
  }
}

function renderFeatures() {
  markerLayer.clearLayers();

  const searchTerm = searchInput.value.trim().toLocaleLowerCase();
  const selectedType = categorySelect.value;

  const visibleFeatures = greenSpaces.filter(feature => {
    const matchesName = feature.name.toLocaleLowerCase().includes(searchTerm);
    const matchesType = selectedType === "all" || feature.type === selectedType;
    return matchesName && matchesType;
  });

  visibleFeatures.forEach(feature => {
    const marker = L.circleMarker(
      [feature.latitude, feature.longitude],
      {
        radius: 7,
        color: "#16452b",
        weight: 2,
        fillColor: "#398657",
        fillOpacity: 0.9
      }
    );

    marker.bindPopup(buildPopup(feature));
    marker.addTo(markerLayer);
  });

  countElement.textContent = `${visibleFeatures.length} shown / ${greenSpaces.length} total features`;
}

searchInput.addEventListener("input", renderFeatures);
categorySelect.addEventListener("change", renderFeatures);
loadButton.addEventListener("click", loadData);

// Initial load
loadData();
