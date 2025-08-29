// script.js (corrección: robusto para filas 2..5 y matching por nombre normalizado)

const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheet1 = "Sheet1"; // leaderboard (totales y orden)
const sheet2 = "Sheet2"; // detalle matches (filas 2..5, columnas B..Y)
const url1 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet1}`;
const url2 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet2}`;

const container = document.getElementById("leaderboard");

// Estado global
let rowsTotal = [];            // [{ name, score }]
let rowsMatches = {};          // { nombre_normalizado: [m1, m2, ...] }
let maxMatches = 0;
let currentMatchIndex = 0;
let lastShownMatch = -1;

// helpers
function parseGviz(text) {
  return JSON.parse(text.substr(47).slice(0, -2));
}
function normalizeName(n) {
  return (n ?? "").toString().trim().toLowerCase();
}
function attachImageWithFallback(img, rawName) {
  const candidates = [
    `${rawName}.png`,
    `${rawName}.jpg`,
    `${rawName}.jpeg`,
    `${rawName.replace(/\s+/g, '')}.png`,
    `${rawName.replace(/\s+/g, '_')}.png`,
    `DEFAULT.png`
  ];
  let idx = 0;
  img.onerror = () => {
    idx++;
    if (idx < candidates.length) img.src = encodeURI(candidates[idx]);
  };
  img.src = encodeURI(candidates[0]);
}

// fetch
async function fetchSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseGviz(text);
}

// carga de datos
async function cargarDatos() {
  try {
    // Hoja1: totales y orden
    const j1 = await fetchSheet(url1);
    rowsTotal = (j1.table.rows || []).map(r => ({
      name: (r.c[0]?.v ?? "Sin nombre").toString().trim(),
      score: Number.isFinite(Number(r.c[1]?.v)) ? parseInt(r.c[1].v, 10) : 0
    }));
    rowsTotal.sort((a, b) => b.score - a.score);

    // Hoja2: buscar las primeras 4 filas con nombre (robusto frente a índices vacíos)
    const j2 = await fetchSheet(url2);
    rowsMatches = {};
    const allRows = j2.table.rows || [];
    let found = 0;
    for (let i = 0; i < allRows.length && found < 4; i++) {
      const row = allRows[i];
      if (!row) continue;
      const nameRaw = row.c[0]?.v;
      if (!nameRaw) continue; // saltar filas sin nombre
      const name = nameRaw.toString().trim();
      // Leer columnas B..Y => indices 1..24
      const vals = [];
      for (let col = 1; col <= 24; col++) {
        const cell = row.c[col];
        if (cell?.v !== null && cell?.v !== undefined && String(cell.v).trim() !== "") {
          const parsed = parseInt(cell.v, 10);
          vals.push(Number.isNaN(parsed) ? cell.v : parsed);
        }
      }
      if (vals.length > 0) {
        rowsMatches[normalizeName(name)] = vals;
      }
      found++;
    }

    // calcular maxMatches
    const lengths = Object.values(rowsMatches).map(a => a.length);
    maxMatches = lengths.length ? Math.max(...lengths) : 0;
    if (maxMatches > 0) currentMatchIndex = currentMatchIndex % Math.max(1, maxMatches);
    else currentMatchIndex = 0;

    // (opcional) debug: ver qué filas se leyeron de Sheet2
    // console.log("rowsMatches (keys):", Object.keys(rowsMatches), "maxMatches:", maxMatches);
    renderLeaderboard();

  } catch (err) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${err.message}</div>`;
    console.error(err);
  }
}

// render
function renderLeaderboard() {
  container.innerHTML = "";
  if (!rowsTotal.length) return;

  const top = rowsTotal.slice(0, 10);
  const matchToShow = maxMatches > 0 ? (currentMatchIndex % maxMatches) : -1;

  top.forEach(entry => {
    const name = entry.name;
    const score = entry.score;

    const rowEl = document.createElement("div");
    rowEl.className = "entry";

    const img = document.createElement("img");
    img.className = "player-img";
    img.alt = name;
    attachImageWithFallback(img, name);

    const nameDiv = document.createElement("div");
    nameDiv.className = "name";
    nameDiv.textContent = name;
    nameDiv.title = name;

    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.textContent = score;

    const matchDiv = document.createElement("div");
    matchDiv.className = "last-match";

    const arr = rowsMatches[normalizeName(name)] || [];
    if (matchToShow >= 0 && arr.length > 0) {
      matchDiv.textContent = `M${matchToShow + 1}: ${arr[matchToShow]}`;
    } else {
      matchDiv.textContent = "";
    }

    if (matchToShow !== lastShownMatch) {
      matchDiv.classList.add("highlight");
      const remove = () => {
        matchDiv.classList.remove("highlight");
        matchDiv.removeEventListener("animationend", remove);
      };
      matchDiv.addEventListener("animationend", remove);
      setTimeout(() => matchDiv.classList.remove("highlight"), 1100);
    }

    rowEl.appendChild(img);
    rowEl.appendChild(nameDiv);
    rowEl.appendChild(scoreDiv);
    rowEl.appendChild(matchDiv);

    container.appendChild(rowEl);
  });

  lastShownMatch = (maxMatches > 0 ? (currentMatchIndex % maxMatches) : -1);
}

// init + timers
cargarDatos();

// rotar columna cada 5s
setInterval(() => {
  if (maxMatches <= 0) return;
  currentMatchIndex++;
  renderLeaderboard();
}, 5000);

// recargar datos cada 30s
setInterval(() => {
  cargarDatos();
}, 30000);
