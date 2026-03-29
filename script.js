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
let winMarkers = [];          // [true/false] por match, desde fila 5 de la tabla
const MAX_MATCHES = 24;

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

    // Hoja2: tomar las primeras 4 filas de jugadores (tabla 1..4)
    const j2 = await fetchSheet(url2);
    rowsMatches = {};
    winMarkers = [];
    const allRows = j2.table.rows || [];

    // Filas 1..4 de la tabla: jugadores (en la hoja son 2..5 por encabezado)
    for (let i = 0; i < 4; i++) {
      const row = allRows[i];
      if (!row) continue;
      const nameRaw = row.c?.[0]?.v;
      if (!nameRaw) continue;

      const name = nameRaw.toString().trim();
      const vals = [];
      for (let col = 1; col <= MAX_MATCHES; col++) {
        const cell = row.c?.[col];
        if (cell?.v !== null && cell?.v !== undefined && String(cell.v).trim() !== "") {
          const parsed = parseInt(cell.v, 10);
          vals.push(Number.isNaN(parsed) ? cell.v : parsed);
        }
      }
      rowsMatches[normalizeName(name)] = vals;
    }

    // Fila 5 de la tabla (en hoja: fila 6): marca de WIN por match si hay cualquier caracter
    const winRow = allRows[4];
    for (let col = 1; col <= MAX_MATCHES; col++) {
      const raw = winRow?.c?.[col]?.v;
      winMarkers.push(raw !== null && raw !== undefined && String(raw).trim() !== "");
    }

    // calcular máximo de partidas reales con datos (kills o WIN), limitado a 24
    let lastMatchWithData = -1;
    for (let i = 0; i < MAX_MATCHES; i++) {
      const hasWin = !!winMarkers[i];
      const hasKill = Object.values(rowsMatches).some(arr => {
        const v = arr[i];
        return v !== null && v !== undefined && String(v).trim() !== "";
      });
      if (hasWin || hasKill) lastMatchWithData = i;
    }

    maxMatches = lastMatchWithData + 1;
    if (maxMatches > 0) currentMatchIndex = currentMatchIndex % maxMatches;
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

  const top = rowsTotal.slice(0, 4);
  const hasMatchData = maxMatches > 0;
  const matchToShow = hasMatchData ? (currentMatchIndex % maxMatches) : -1;
  const isWinMatch = matchToShow >= 0 && !!winMarkers[matchToShow];

  const matchKills = top.map(entry => {
    const arr = rowsMatches[normalizeName(entry.name)] || [];
    const val = arr[matchToShow];
    return Number.isFinite(Number(val)) ? Number(val) : null;
  });
  const bestKill = matchKills.some(v => v !== null) ? Math.max(...matchKills.filter(v => v !== null)) : null;

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

    const arr = rowsMatches[normalizeName(name)] || [];
    let matchDiv = null;
    if (hasMatchData) {
      matchDiv = document.createElement("div");
      matchDiv.className = "last-match";
      const currentKill = arr[matchToShow];

      const matchMain = document.createElement("div");
      matchMain.className = "match-main";
      matchMain.textContent = `M${matchToShow + 1}: ${currentKill ?? "—"}`;
      matchDiv.appendChild(matchMain);

      const tagRow = document.createElement("div");
      tagRow.className = "tag-row";

      if (isWinMatch) {
        matchDiv.classList.add("win-match");
        const winBadge = document.createElement("span");
        winBadge.className = "tag win-tag";
        winBadge.textContent = "W🏆";
        tagRow.appendChild(winBadge);
      }

      const numericKill = Number.isFinite(Number(currentKill)) ? Number(currentKill) : null;
      if (bestKill !== null && numericKill !== null && numericKill === bestKill) {
        rowEl.classList.add("killer-row");
        const killerBadge = document.createElement("span");
        killerBadge.className = "tag killer-tag";
        killerBadge.textContent = "K💀";
        tagRow.appendChild(killerBadge);
      }

      if (tagRow.childElementCount > 0) {
        matchDiv.appendChild(tagRow);
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
    }

    rowEl.appendChild(img);
    rowEl.appendChild(nameDiv);
    rowEl.appendChild(scoreDiv);
    if (matchDiv) rowEl.appendChild(matchDiv);

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
