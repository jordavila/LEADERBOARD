const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheetNameTotal = "Sheet1";   // Totales
const sheetNameMatches = "Sheet2"; // Detalle de matches

const urlTotal = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheetNameTotal}`;
const urlMatches = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheetNameMatches}`;

const container = document.getElementById("leaderboard");

// Guardar datos globales
let rowsTotal = [];
let rowsMatches = {};
let currentMatchIndex = 0; // Match que se está mostrando (0 = Match1)

async function cargarDatos() {
  try {
    // --- Leer Hoja1 (totales) ---
    const res1 = await fetch(urlTotal);
    const text1 = await res1.text();
    const json1 = JSON.parse(text1.substr(47).slice(0, -2));
    rowsTotal = json1.table.rows.map(r => ({
      name: r.c[0]?.v?.toString().trim() || "Sin nombre",
      score: parseInt(r.c[1]?.v || "0")
    }));

    // Ordenar
    rowsTotal.sort((a, b) => b.score - a.score);

    // --- Leer Hoja2 (matches) ---
    const res2 = await fetch(urlMatches);
    const text2 = await res2.text();
    const json2 = JSON.parse(text2.substr(47).slice(0, -2));

    rowsMatches = {};
    json2.table.rows.forEach(r => {
      const name = r.c[0]?.v?.toString().trim();
      if (!name) return;
      const kills = r.c.slice(1).map(c => parseInt(c?.v || "0"));
      rowsMatches[name] = kills;
    });

  } catch (error) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${error.message}</div>`;
  }
}

function renderLeaderboard() {
  container.innerHTML = "";

  // Calcular cuántos matches existen como máximo
  const maxMatches = Math.max(...Object.values(rowsMatches).map(arr => arr.length), 0);
  if (maxMatches === 0) return;

  // Ajustar índice para que rote
  const matchToShow = currentMatchIndex % maxMatches;

  rowsTotal.forEach(entry => {
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

    // Total kills
    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.textContent = entry.score;

    // Kills de match actual
    const killsArray = rowsMatches[entry.name] || [];
    const matchValue = killsArray[matchToShow] ?? 0;

    const matchDiv = document.createElement("div");
    matchDiv.className = "last-match highlight";
    matchDiv.textContent = `M${matchToShow + 1}: ${matchValue}`;

    // Agregar todo
    div.appendChild(img);
    div.appendChild(nameDiv);
    div.appendChild(scoreDiv);
    div.appendChild(matchDiv);

    container.appendChild(div);
  });

  // Pasar al siguiente match para la próxima vez
  currentMatchIndex++;
}

// --- Inicializar ---
async function init() {
  await cargarDatos();
  renderLeaderboard();
  // Actualizar visualización cada 5s
  setInterval(() => {
    renderLeaderboard();
  }, 5000);
  // Recargar datos desde Google Sheets cada 30s (para no saturar)
  setInterval(() => {
    cargarDatos();
  }, 30000);
}

init();
