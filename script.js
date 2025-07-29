const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheetName = "Sheet1";
const url = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

const container = document.getElementById("leaderboard");

function cargarLeaderboard() {
  fetch(url)
    .then(res => res.text())
    .then(text => {
      try {
        const json = JSON.parse(text.substr(47).slice(0, -2));
        const rows = json.table.rows.map(r => ({
          name: r.c[0]?.v || "Sin nombre",
          score: parseInt(r.c[1]?.v || "0")
        }));
        rows.sort((a, b) => b.score - a.score);
        const top = rows.slice(0, 10);

        container.innerHTML = "";

        top.forEach(entry => {
          const div = document.createElement("div");
          div.className = "entry";
          div.innerHTML = `<div class="name">${entry.name}</div><div class="score">${entry.score}</div>`;
          container.appendChild(div);
        });
      } catch (error) {
        container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error al procesar los datos: ${error.message}</div>`;
      }
    })
    .catch(err => {
      container.innerHTML = `<div style="color:orange;padding:10px">❌ No se pudo cargar la hoja: ${err.message}</div>`;
    });
}

cargarLeaderboard(); 
setInterval(cargarLeaderboard, 5000);
