// script.js (REEMPLAZAR)
const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheet1 = "Sheet1"; // leaderboard (totales y orden)
const sheet2 = "Sheet2"; // detalle matches (filas 2..5, columnas B..Y)
const url1 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet1}`;
const url2 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet2}`;

const container = document.getElementById("leaderboard");

// Estado global
let rowsTotal = [];        // [{ name, score }]
let rowsMatches = {};      // { name: [m1, m2, ...] }  <- solo filas 2..5
let maxMatches = 0;        // máximo matches detectados entre jugadores
let currentMatchIndex = 0; // índice de rotación global (0 => M1)
let lastShownMatch = -1;   // para detectar cambio y aplicar highlight

// --- Helpers ---
function parseGviz(text) {
  // Google sheets devuelve un prefijo de 47 chars y sufijo `);`
  return JSON.parse(text.substr(47).slice(0, -2));
}

// Intenta varios nombres de archivo para la foto antes de dejar DEFAULT.png
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
    if (idx < candidates.length) {
      img.src = encodeURI(candidates[idx]);
    }
  };
  img.src = encodeURI(candidates[0]);
}

// --- Carga de datos ---
async function fetchSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseGviz(text);
}

async function cargarDatos() {
  try {
    // Hoja1: Totales y orden
    const j1 = await fetchSheet(url1);
    rowsTotal = (j1.table.rows || []).map(r => ({
      name: (r.c[0]?.v ?? "Sin nombre").toString().trim(),
      score: Number.isFinite(Number(r.c[1]?.v)) ? parseInt(r.c[1].v, 10) : 0
    }));
    rowsTotal.sort((a, b) => b.score - a.score);

    // Hoja2: leer filas 2..5 (índices 1..4) y columnas B..Y (índices 1..24)
    const j2 = await fetchSheet(url2);
    rowsMatches = {};
    const rows = j2.table.rows || [];
    for (let i = 1; i <= 4; i++) { // filas 2,3,4,5
      const row = rows[i];
      if (!row) continue;
      const name = row.c[0]?.v?.toString().trim();
      if (!name) continue;

      const vals = [];
      for (let col = 1; col <= 24; col++) { // B..Y
        const cell = row.c[col];
        // Considerar como "dato" solo si no es null/undefined/empty string
        if (cell?.v !== null && cell?.v !== undefined && String(cell.v).trim() !== "") {
          // Parsear a entero si es posible
          const parsed = parseInt(cell.v, 10);
          vals.push(Number.isNaN(parsed) ? String(cell.v) : parsed);
        }
      }
      if (vals.length > 0) {
        rowsMatches[name] = vals;
      } else {
        // Si no hay valores, aseguramos que no exista entrada
        delete rowsMatches[name];
      }
    }

    // Calcular máximo de matches disponible (para la rotación global)
    const lengths = Object.values(rowsMatches).map(a => a.length);
    maxMatches = lengths.length ? Math.max(...lengths) : 0;

    // Si el número máximo cambió y currentMatchIndex está fuera de rango, normalizar
    if (maxMatches > 0) {
      currentMatchIndex = currentMatchIndex % Math.max(1, maxMatches);
    } else {
      currentMatchIndex = 0;
    }

    // Renderizar tabla (manteniendo el layout original)
    renderLeaderboard();

  } catch (err) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${err.message}</div>`;
    console.error(err);
  }
}

// --- Render ---
function renderLeaderboard() {
  container.innerHTML = "";

  if (!rowsTotal.length) return;

  const top = rowsTotal.slice(0, 10); // mantener top 10 como layout original
  // determinar qué match global debemos mostrar en esta pasada
  const matchToShow = maxMatches > 0 ? (currentMatchIndex % maxMatches) : -1;

  top.forEach(entry => {
    const name = entry.name;
    const score = entry.score;

    const rowEl = document.createElement("div");
    rowEl.className = "entry";

    // 1) Imagen
    const img = document.createElement("img");
    img.className = "player-img";
    img.alt = name;
    attachImageWithFallback(img, name);

    // 2) Nombre (con title para ver completo al hover)
    const nameDiv = document.createElement("div");
    nameDiv.className = "name";
    nameDiv.textContent = name;
    nameDiv.title = name;

    // 3) Score (total desde Sheet1)
    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.textContent = score;

    // 4) Columna rotante (usar la clase esperada por el CSS: last-match)
    const matchDiv = document.createElement("div");
    matchDiv.className = "last-match";
    // Si hay matches para este jugador
    const arr = rowsMatches[name] || [];
    if (matchToShow >= 0 && arr.length > 0) {
      const val = arr[matchToShow];
      matchDiv.textContent = `M${matchToShow + 1}: ${val}`;
    } else {
      matchDiv.textContent = ""; // dejar vacío si no hay dato
    }

    // Si cambió el match global, aplicar highlight (animación definida en CSS)
    if (matchToShow !== lastShownMatch) {
      matchDiv.classList.add("highlight");
      // quitar la clase cuando termine la animación para poder re-aplicarla en la siguiente rotación
      const removeHighlight = () => {
        matchDiv.classList.remove("highlight");
        matchDiv.removeEventListener("animationend", removeHighlight);
      };
      matchDiv.addEventListener("animationend", removeHighlight);
      // como fallback, quitar después de 1s si 'animationend' no dispara
      setTimeout(() => matchDiv.classList.remove("highlight"), 1100);
    }

    // Agregar en el orden que el CSS espera (img | name | score | match)
    rowEl.appendChild(img);
    rowEl.appendChild(nameDiv);
    rowEl.appendChild(scoreDiv);
    rowEl.appendChild(matchDiv);

    container.appendChild(rowEl);
  });

  // actualizar trackers
  lastShownMatch = (maxMatches > 0 ? (currentMatchIndex % maxMatches) : -1);
}

// --- Inicialización y timers ---
// Carga inicial
cargarDatos().then(() => {
  // primer render ya hecho desde cargarDatos()
});

// Rotación del match mostrado cada 5s (solo cambia la columna rotante)
setInterval(() => {
  if (maxMatches <= 0) return; // nada que rotar
  currentMatchIndex++;
  // Re-render para reflejar la siguiente columna rotante (no recargamos sheet aquí)
  renderLeaderboard();
}, 5000);

// Refrescar datos completos (Sheet1 + Sheet2) cada 30s
setInterval(() => {
  cargarDatos();
}, 30000);
