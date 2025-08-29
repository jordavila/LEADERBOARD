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

        // Procesar filas de la hoja de cálculo
        const rows = json.table.rows.map(r => ({
          name: r.c[0]?.v?.toString().trim() || "Sin nombre", // Nombre jugador
          score: parseInt(r.c[1]?.v || "0") // Kills
        }));

        // Ordenar por número de kills (mayor a menor)
        rows.sort((a, b) => b.score - a.score);

        // Tomar los 10 primeros
        const top = rows.slice(0, 10);

        // Limpiar el contenedor antes de volver a renderizar
        container.innerHTML = "";

        top.forEach(entry => {
          const div = document.createElement("div");
          div.className = "entry";

          // Crear contenedor de imagen
          const img = document.createElement("img");
          img.className = "player-img";

          // Nombre de archivo esperado
          const imageName = `${entry.name}.png`;

          // Ruta de la imagen (mismo directorio)
          img.src = imageName;

          // Si la imagen no existe, usar DEFAULT.png
          img.onerror = () => {
            img.src = "DEFAULT.png";
          };

          // Nombre del jugador
          const nameDiv = document.createElement("div");
          nameDiv.className = "name";
          nameDiv.textContent = entry.name;

          // Puntuación
          const scoreDiv = document.createElement("div");
          scoreDiv.className = "score";
          scoreDiv.textContent = entry.score;

          // Agregar todo al div principal
          div.appendChild(img);
          div.appendChild(nameDiv);
          div.appendChild(scoreDiv);

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

// Cargar inicialmente y actualizar cada 5 segundos
cargarLeaderboard();
setInterval(cargarLeaderboard, 5000);
