// ====== CONFIG ======
const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheetNameTotal   = "Sheet1";   // Totales (y orden)
const sheetNameMatches = "Sheet2";   // Detalle por match

const urlTotal   = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheetNameTotal}`;
const urlMatches = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheetNameMatches}`;

const container = document.getElementById("leaderboard");

// Estado global
let rowsTotal = [];        // [{name, score}]
let rowsMatches = {};      // { name: [m1, m2, ...] }
let currentMatchIndex = 0; // Índice del match que se muestra (0 = M1)
let maxMatches = 0;        // Máximo número de matches encontrados
let lastRenderedKey = "";  // Para forzar highlight al rotar

// Utilidad: parseo seguro del JSON de Google Visualization API
function parseGviz(text) {
  return JSON.parse(text.substr(47).slice(0, -2));
}

// Carga datos de ambas hojas
async function cargarDatos() {
  try {
    // ---- Hoja 1: Totales ----
    const r1 = await fetch(urlTotal);
    const t1 = await r1.text();
    const j1 = parseGviz(t1);

    rowsTotal = j1.table.rows.map(r => ({
      name: r.c[0]?.v?.toString().trim() || "Sin nombre",
      score: parseInt(r.c[1]?.v || "0", 10)
    }));

    // Orden descendente por total
    rowsTotal.sort((a, b) => b.score - a.score);

    // ---- Hoja 2: Matches ----
    const r2 = await fetch(urlMatches);
    const t2 = await r2.text();
    const j2 = parseGviz(t2);

    rowsMatches = {};
    j2.table.rows.forEach(r => {
      const name = r.c[0]?.v?.toString().trim();
      if (!name) return;
      // Mapear kills por match, ignorando vacíos y NaN al final
      const kills = r.c.slice(1).map(c => parseInt(c?.v || "0", 10));
      // Recortar ceros "vacíos" al final si hay trailing blanks en la hoja
      let last = kills.length - 1;
      while (last >= 0 && (kills[last] === null || isNaN(kills[last]))) last--;
      rowsMatches[name] = kills.slice(0, Math.max(last + 1, 0));
    });

    // Calcular el máximo número de matches disponible en el dataset
    const lengths = Object.values(rowsMatches).map(arr => arr.length);
    maxMatches = lengths.length ? Math.max(...lengths) : 0;

  } catch (err) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${err.message}</div>`;
  }
}

// Render del leaderboard (usa Sheet1 para orden y total, y Sheet2 para el match rotante)
function renderLeaderboard() {
  container.innerHTML = "";

  if (!rowsTotal.length) return;

  // Asegurar que el índice rote dentro del rango disponible
  const matchToShow = maxMatches > 0 ? (currentMatchIndex % maxMatches) : 0;

  // Solo mostramos a quienes están en Sheet1 (tal como se pidió)
  // Opcional: limitar a top 10 como el layout original
  const top = rowsTotal.slice(0, 10);

  top.forEach(entry => {
    const div = document.createElement("div");
    div.className = "entry";

    // Imagen
    const img = document.createElement("img");
    img.className = "player-img";
    img.src = `${entry.name}.png`;
    img.onerror = () => { img.src = "DEFAULT.png"; };

    // Nombre
    const nameDiv = document.createElement("div");
    nameDiv.className = "name";
    nameDiv.textContent = entry.name;

    // Total (de Sheet1)
    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.textContent = entry.score;

    // Valor del match actual (de Sheet2)
    const arr = rowsMatches[entry.name] || [];
    const val = (arr[matchToShow] ?? 0);
    const matchDiv = document.createElement("div");
    matchDiv.className = "last-match";
    matchDiv.textContent = `M${matchToShow + 1}: ${val}`;

    // Efecto visual al rotar de match (se aplica a todos a la vez)
    // Creamos una "llave" del render para saber si cambió el match mostrado
    const renderKey = `m${matchToShow}`;
    if (renderKey !== lastRenderedKey) {
      matchDiv.classList.add("highlight");
      // Quitar la clase tras la animación
      setTimeout(() => matchDiv.classList.remove("highlight"), 950);
    }

    // Estructura final
    div.appendChild(img);
    div.appendChild(nameDiv);
    div.appendChild(scoreDiv);
    div.appendChild(matchDiv);

    container.appendChild(div);
  });

  // Actualizamos la llave para la próxima rotación
  lastRenderedKey = `m${matchToShow}`;
  // Pasamos al siguiente match (la rotación real ocurre cada 5s en el interval)
  currentMatchIndex++;
}

// Inicialización
async function init() {
  await cargarDatos();
  renderLeaderboard();

  // Rotar el match mostrado cada 5s
  setInterval(() => {
    // Si no hay datos de matches aún, no intentamos rotar
    if (maxMatches === 0) return;
    renderLeaderboard();
  }, 5000);

  // Refrescar datos desde Google Sheets cada 30s (evita sobrecargar)
  setInterval(async () => {
    const prevMax = maxMatches;
    await cargarDatos();
    // Si aumentó el número de matches, mantenemos el índice rotando sin romper
    if (maxMatches !== prevMax) {
      currentMatchIndex = currentMatchIndex % Math.max(maxMatches, 1);
    }
  }, 30000);
}

// Go!
init();
