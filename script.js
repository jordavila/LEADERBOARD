const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheet1 = "Sheet1"; // leaderboard
const sheet2 = "Sheet2"; // matches
const url1 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet1}`;
const url2 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet2}`;

const container = document.getElementById("leaderboard");

let matchesData = {}; // { jugador: [match1, match2, ...] }
let matchIndex = {};  // { jugador: idxActual }

async function fetchSheet(url) {
  const res = await fetch(url);
  const text = await res.text();
  return JSON.parse(text.substr(47).slice(0, -2));
}

async function cargarDatos() {
  try {
    // Leer leaderboard (Sheet1)
    const json1 = await fetchSheet(url1);
    const rows1 = json1.table.rows.map(r => ({
      name: r.c[0]?.v || "Sin nombre",
      score: parseInt(r.c[1]?.v || "0")
    }));
    rows1.sort((a, b) => b.score - a.score);
    const top = rows1.slice(0, 10);

    // Leer matches (Sheet2)
    const json2 = await fetchSheet(url2);
    matchesData = {}; // reset
    json2.table.rows.forEach((r, i) => {
      // Solo filas 2,3,4,5 → índices 1,2,3,4
      if (i >= 1 && i <= 4) {
        const name = r.c[0]?.v;
        if (!name) return;

        // columnas B..Y → indices 1 a 24
        const values = [];
        for (let j = 1; j <= 24; j++) {
          const val = r.c[j]?.v;
          if (val !== null && val !== undefined && val !== "") {
            values.push(val);
          }
        }
        if (values.length > 0) {
          matchesData[name] = values;
          if (!(name in matchIndex)) matchIndex[name] = 0;
        }
      }
    });

    // Render leaderboard con columna extra
    container.innerHTML = "";
    top.forEach(entry => {
      const div = document.createElement("div");
      div.className = "entry";

      const nameDiv = document.createElement("div");
      nameDiv.className = "name";
      nameDiv.textContent = entry.name;

      const scoreDiv = document.createElement("div");
      scoreDiv.className = "score";
      scoreDiv.textContent = entry.score;

      const matchDiv = document.createElement("div");
      matchDiv.className = "match";
      matchDiv.textContent = ""; // inicial
      matchDiv.style.minWidth = "60px";

      div.appendChild(nameDiv);
      div.appendChild(scoreDiv);
      div.appendChild(matchDiv);
      container.appendChild(div);
    });

  } catch (err) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${err.message}</div>`;
  }
}

// Actualizar matches en rotación
function rotarMatches() {
  const entries = container.querySelectorAll(".entry");
  entries.forEach(entry => {
    const name = entry.querySelector(".name").textContent;
    const matchDiv = entry.querySelector(".match");

    if (matchesData[name] && matchesData[name].length > 0) {
      const idx = matchIndex[name] || 0;
      const val = matchesData[name][idx];

      // Animación simple (fade)
      matchDiv.style.opacity = 0;
      setTimeout(() => {
        matchDiv.textContent = val;
        matchDiv.style.opacity = 1;
      }, 300);

      // avanzar al siguiente
      matchIndex[name] = (idx + 1) % matchesData[name].length;
    } else {
      matchDiv.textContent = "";
    }
  });
}

// Primera carga
cargarDatos().then(() => {
  rotarMatches();
});

// Recargar leaderboard y matches cada 30s
setInterval(cargarDatos, 30000);

// Rotar columna match cada 5s
setInterval(rotarMatches, 5000);
