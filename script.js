const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheet1 = "Sheet1"; // activos + kills totales
const sheet2 = "Sheet2"; // partidas por jugador + fila Resultado (puestos)
const url1 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet1}`;
const url2 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet2}`;

const MAX_PLAYERS = 4;
const MAX_MATCHES = 24;

const container = document.getElementById("leaderboard");
const dashboardEl = document.getElementById("dashboard");
const summaryEl = document.getElementById("summary-table");
const heatmapEl = document.getElementById("heatmap");
const exportBtn = document.getElementById("export-image-btn");
document.getElementById("source-sheet-link").href = `https://docs.google.com/spreadsheets/d/${sheetID}/edit`;

// estado
let rowsTotal = []; // [{name, score}] de Sheet1 (jugadores activos)
let rowsMatches = {}; // nombre_normalizado => [m1..mn] compactadas
let winMarkers = []; // [bool] compactadas
let matchPositions = []; // puestos válidos o null, alineados con las partidas
let activePlayers = []; // [{name, score}]
let compactLabels = []; // ["M1", "M2", ...] compactadas
let playerStats = []; // stats calculadas por jugador
let dashboardStats = null;

let maxMatches = 0;
let currentMatchIndex = 0;
let lastShownMatch = -1;

let totalKillsChart = null;
let avgKillsChart = null;
let trendChart = null;
let cumulativeChart = null;
let ledChart = null;
let positionChart = null;
const PLAYER_COLORS = ["#F5D21B", "#C6C5B9", "#77786D", "#B9825A"];

function parseGviz(text) {
  // Mantener compatibilidad con la respuesta estándar de GViz
  // y tolerar variaciones menores del wrapper.
  try {
    return JSON.parse(text.substr(47).slice(0, -2));
  } catch {
    const match = text.match(/setResponse\\((.*)\\);/s);
    if (!match?.[1]) throw new Error("Respuesta GViz inválida");
    return JSON.parse(match[1]);
  }
}

function normalizeName(n) {
  return (n ?? "").toString().trim().toLowerCase();
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function format1(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toFixed(1);
}

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Math.round(Number(value)).toString();
}

function attachImageWithFallback(img, rawName) {
  const candidates = [
    `${rawName}.png`,
    `${rawName}.jpg`,
    `${rawName}.jpeg`,
    `${rawName.replace(/\s+/g, "")}.png`,
    `${rawName.replace(/\s+/g, "_")}.png`,
    "DEFAULT.png"
  ];
  let idx = 0;
  img.onerror = () => {
    idx++;
    if (idx < candidates.length) img.src = encodeURI(candidates[idx]);
  };
  img.src = encodeURI(candidates[0]);
}

function shortName(name) {
  const cleaned = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return cleaned.slice(0, 3) || "PLY";
}

function buildExportFilename() {
  const top = rowsTotal.slice(0, MAX_PLAYERS);
  const token = top
    .map(p => `${shortName(p.name)}#${formatInt(p.score)}`)
    .join("");
  return token || "LEADERBOARD";
}

function formatExportET(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")} • ${get("hour")}:${get("minute")}:${get("second")} ET`;
}

async function exportToImage() {
  if (typeof html2canvas === "undefined") {
    alert("No se pudo exportar: html2canvas no está disponible.");
    return;
  }
  let previousStyles = [];
  let previousToolbarNodes = [];
  let exportStamp = null;
  try {
    const dateText = formatExportET(new Date());
    const toolbar = document.querySelector(".toolbar");
    if (toolbar) {
      previousToolbarNodes = Array.from(toolbar.childNodes);
      exportStamp = document.createElement("div");
      exportStamp.className = "export-stamp";
      exportStamp.textContent = `Exported: ${dateText}`;
      toolbar.replaceChildren(exportStamp);
    }

    // Expandir temporalmente tablas con scroll para capturar todo el contenido
    const tableWraps = Array.from(document.querySelectorAll(".table-wrap"));
    previousStyles = tableWraps.map(el => ({
      el,
      overflowX: el.style.overflowX,
      maxWidth: el.style.maxWidth
    }));

    tableWraps.forEach(el => {
      el.style.overflowX = "visible";
      el.style.maxWidth = "none";
      el.style.width = "100%";
    });

    // Ajustes adaptativos de exportación según cantidad de partidas
    const body = document.body;
    body.classList.add("exporting");
    if (maxMatches <= 8) body.classList.add("export-few");
    else if (maxMatches <= 16) body.classList.add("export-mid");
    else body.classList.add("export-many");

    await new Promise(resolve => requestAnimationFrame(resolve));
    const canvas = await html2canvas(document.body, {
      backgroundColor: "#11120F",
      scale: maxMatches > 16 ? 1.45 : 1.7,
      useCORS: true
    });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${buildExportFilename()}.png`;
    a.click();
  } catch (err) {
    console.error(err);
    alert(`No se pudo exportar imagen: ${err.message}`);
  } finally {
    previousStyles.forEach(({ el, overflowX, maxWidth }) => {
      el.style.overflowX = overflowX;
      el.style.maxWidth = maxWidth;
      el.style.width = "";
    });
    const toolbar = document.querySelector(".toolbar");
    if (toolbar && exportStamp) toolbar.replaceChildren(...previousToolbarNodes);
    const body = document.body;
    body.classList.remove("exporting", "export-few", "export-mid", "export-many");
  }
}

async function fetchSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseGviz(text);
}

function stdDevPopulation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function toPositionOrNull(value) {
  const position = toNumberOrNull(value);
  return Number.isInteger(position) && position >= 1 ? position : null;
}

function rebuildDerivedData(rawPlayerMatches, rawPositions) {
  const activeNames = activePlayers.map(p => p.name);

  // compactar partidas: solo partidas donde TODOS los activos tienen dato
  const validIndices = [];
  for (let col = 0; col < MAX_MATCHES; col++) {
    const allActiveHaveData = activeNames.length > 0 && activeNames.every(name => {
      const arr = rawPlayerMatches[normalizeName(name)] || [];
      const v = arr[col];
      return v !== null && v !== undefined && String(v).trim() !== "";
    });
    if (allActiveHaveData) validIndices.push(col);
  }

  // construir estructuras compactadas
  rowsMatches = {};
  activeNames.forEach(name => {
    const src = rawPlayerMatches[normalizeName(name)] || [];
    rowsMatches[normalizeName(name)] = validIndices.map(i => toNumberOrNull(src[i]) ?? 0);
  });

  matchPositions = validIndices.map(i => toPositionOrNull(rawPositions[i]));
  winMarkers = matchPositions.map(position => position === 1);
  compactLabels = validIndices.map((_, idx) => `M${idx + 1}`);

  maxMatches = validIndices.length;
  if (maxMatches > 0) currentMatchIndex = currentMatchIndex % maxMatches;
  else currentMatchIndex = 0;

  computeStats();
}

function computeStats() {
  const players = activePlayers.map(p => p.name);
  const matchesPlayed = maxMatches;
  const wins = winMarkers.filter(Boolean).length;

  const groupMeans = [];
  playerStats = players.map((name, idx) => {
    const arr = rowsMatches[normalizeName(name)] || [];
    const kills = arr.map(v => toNumberOrNull(v) ?? 0);
    const totalKills = kills.reduce((a, b) => a + b, 0);
    const avg = matchesPlayed > 0 ? totalKills / matchesPlayed : 0;
    const bestMatch = kills.length ? Math.max(...kills) : 0;
    const std = stdDevPopulation(kills);
    groupMeans.push(avg);
    return {
      player: name,
      position: idx + 1,
      totalKills,
      avg,
      bestMatch,
      std,
      ledMatches: 0,
      pctTotal: 0,
      sharpe: null,
      series: kills
    };
  });

  for (let m = 0; m < matchesPlayed; m++) {
    const values = playerStats.map(s => s.series[m] ?? 0);
    const maxVal = values.length ? Math.max(...values) : null;
    playerStats.forEach((s, i) => {
      if (maxVal !== null && values[i] === maxVal) s.ledMatches += 1;
    });
  }

  const teamTotalKills = playerStats.reduce((acc, s) => acc + s.totalKills, 0);
  const groupMean = groupMeans.length ? (groupMeans.reduce((a, b) => a + b, 0) / groupMeans.length) : 0;

  playerStats.forEach(s => {
    s.pctTotal = teamTotalKills > 0 ? (s.totalKills / teamTotalKills) * 100 : 0;
    if (s.std === 0) s.sharpe = null; // N/A por regla acordada
    else s.sharpe = (s.avg - groupMean) / s.std;
  });

  const bloodiest = (() => {
    if (!matchesPlayed) return { label: "N/A", kills: 0 };
    let bestIdx = 0;
    let bestKills = -1;
    for (let m = 0; m < matchesPlayed; m++) {
      const sum = playerStats.reduce((acc, s) => acc + (s.series[m] ?? 0), 0);
      if (sum > bestKills) {
        bestKills = sum;
        bestIdx = m;
      }
    }
    return { label: compactLabels[bestIdx], kills: bestKills };
  })();

  // Comparar valores sin redondear; Sharpe no disponible queda detrás del válido.
  const captains = matchesPlayed > 0 ? selectCaptains(playerStats) : [];
  const bestPlayer = captains.length
    ? `${captains.map(captain => captain.player).join(", ")} (${formatInt(captains[0].totalKills)})`
    : "N/A";

  const recordKill = (() => {
    if (!playerStats.length || matchesPlayed === 0) return { names: "N/A", kills: 0 };
    let maxKill = -1;
    playerStats.forEach(s => {
      s.series.forEach(v => {
        if (v > maxKill) maxKill = v;
      });
    });
    if (maxKill < 0) return { names: "N/A", kills: 0 };
    const names = playerStats
      .filter(s => s.series.some(v => v === maxKill))
      .map(s => s.player)
      .join(", ");
    return { names, kills: maxKill };
  })();

  const pacifist = (() => {
    if (!playerStats.length || matchesPlayed === 0) return { names: "N/A", zeroMatches: 0 };
    let maxZeros = -1;
    playerStats.forEach(s => {
      const zeroCount = s.series.filter(v => v === 0).length;
      if (zeroCount > maxZeros) maxZeros = zeroCount;
    });
    if (maxZeros <= 0) return { names: "N/A", zeroMatches: 0 };
    const names = playerStats
      .filter(s => s.series.filter(v => v === 0).length === maxZeros)
      .map(s => s.player)
      .join(", ");
    return { names, zeroMatches: maxZeros };
  })();

  const sharpeValid = playerStats.filter(s => s.sharpe !== null && Number.isFinite(s.sharpe));
  const bestSharpe = sharpeValid.length
    ? sharpeValid.reduce((a, b) => (b.sharpe > a.sharpe ? b : a))
    : null;
  const worstSharpe = sharpeValid.length
    ? sharpeValid.reduce((a, b) => (b.sharpe < a.sharpe ? b : a))
    : null;

  const globalAvgKills = matchesPlayed > 0 ? (teamTotalKills / matchesPlayed) : 0;
  const winRate = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;
  const recordedPositions = matchPositions.filter(position => position !== null);
  const avgPosition = recordedPositions.length
    ? recordedPositions.reduce((sum, position) => sum + position, 0) / recordedPositions.length
    : null;

  dashboardStats = {
    matchesPlayed,
    wins,
    teamTotalKills,
    bestPlayer,
    captains,
    avgPosition,
    globalAvgKills,
    bloodiest,
    recordKill,
    pacifist,
    bestSharpePlayer: bestSharpe ? `${bestSharpe.player} (${format1(bestSharpe.sharpe)})` : "N/A",
    worstSharpePlayer: worstSharpe ? `${worstSharpe.player} (${format1(worstSharpe.sharpe)})` : "N/A",
    winRate
  };
}

function compareCaptains(a, b) {
  if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
  const aSharpe = Number.isFinite(a.sharpe) ? a.sharpe : -Infinity;
  const bSharpe = Number.isFinite(b.sharpe) ? b.sharpe : -Infinity;
  if (aSharpe !== bSharpe) return bSharpe > aSharpe ? 1 : -1;
  return b.bestMatch - a.bestMatch;
}

function selectCaptains(stats) {
  const ranked = [...stats].sort(compareCaptains);
  return ranked.length ? ranked.filter(player => compareCaptains(player, ranked[0]) === 0).slice(0, MAX_PLAYERS) : [];
}

function renderCaptain() {
  const panel = document.getElementById("captain");
  const captains = dashboardStats?.captains || [];
  panel.hidden = captains.length === 0;
  panel.parentElement?.classList.toggle("shared-captains", captains.length > 1);
  // Keep existing image nodes on refresh so animations do not restart every 30s.
  const signature = JSON.stringify(captains.map(({ player, totalKills, sharpe, bestMatch }) => ({ player, totalKills, sharpe, bestMatch })));
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  panel.style.setProperty("--captain-count", captains.length);
  panel.replaceChildren();
  if (!captains.length) return;
  const portraits = new Set(["JADO82", "GEODUQUE", "ANDRESFU", "DANILO", "DANTE", "FREDDY", "HAROLDO", "MANQUINHO"]);
  const uprightPortraits = new Set(["JADO82", "MANQUINHO", "ANDRESFU", "HAROLDO"]);
  captains.forEach(captain => {
    const card = document.createElement("article");
    card.className = "captain-card";
    const stage = document.createElement("div");
    stage.className = "captain-stage";
    const image = document.createElement("img");
    image.className = "captain-avatar";
    const key = captain.player.trim().toUpperCase().replace(/\s+/g, "");
    const portrait = portraits.has(key) ? key : "DEFAULT";
    image.onerror = () => {
      image.onerror = null;
      image.src = "assets/captains/DEFAULT.png";
    };
    image.src = `assets/captains/${portrait}${uprightPortraits.has(portrait) ? "-v2" : ""}.png`;
    image.alt = `${captain.player}, capitán de cuerpo completo con uniforme y arma`;
    const label = document.createElement("div");
    label.className = "captain-label";
    label.textContent = captains.length > 1 ? "MEJOR JUGADOR · COMPARTIDO" : "CAPITÁN DEL EQUIPO";
    const name = document.createElement("div");
    name.className = "captain-name fit-text";
    name.textContent = captain.player;
    const stats = document.createElement("div");
    stats.className = "captain-stats";
    stats.textContent = `${formatInt(captain.totalKills)} kills · Sharpe ${format1(captain.sharpe)} · Récord ${formatInt(captain.bestMatch)}`;
    stage.appendChild(image);
    card.appendChild(stage);
    card.appendChild(label);
    card.appendChild(name);
    card.appendChild(stats);
    panel.appendChild(card);
  });
  scheduleTextFit();
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatKpiValue(value) {
  const match = String(value).match(/^(.*?)\s+\(([^()]*)\)$/);
  if (!match) return `<span class="fit-text">${escapeHTML(value)}</span>`;
  return match[1].split(/,\s*/).map(name => `<span class="kpi-name fit-text">${escapeHTML(name)}</span>`).join("")
    + `<span class="kpi-detail fit-text">(${escapeHTML(match[2])})</span>`;
}

function fitTextToWidth(element) {
  element.style.fontSize = "";
  const width = element.clientWidth;
  if (!width) return;
  const maximum = parseFloat(getComputedStyle(element).fontSize);
  if (element.scrollWidth <= width) return;
  let low = 1;
  let high = maximum;
  // Measure actual rendered text instead of assuming every character is equally wide.
  for (let i = 0; i < 10; i++) {
    const size = (low + high) / 2;
    element.style.fontSize = `${size}px`;
    if (element.scrollWidth > width) high = size;
    else low = size;
  }
  element.style.fontSize = `${Math.floor(low * 10) / 10}px`;
}

function scheduleTextFit() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".fit-text, .entry .name").forEach(fitTextToWidth);
  });
}

function renderDashboard() {
  if (!dashboardStats) {
    dashboardEl.innerHTML = "";
    return;
  }

  const cards = [
    ["Partidas Jugadas", formatInt(dashboardStats.matchesPlayed)],
    ["Victorias", formatInt(dashboardStats.wins)],
    ["Posición Promedio", format1(dashboardStats.avgPosition)],
    ["Kills Totales", formatInt(dashboardStats.teamTotalKills)],
    [dashboardStats.captains.length > 1 ? "Mejor Jugador · compartido" : "Mejor Jugador", dashboardStats.bestPlayer],
    ["Record Kill", `${dashboardStats.recordKill.names} (${formatInt(dashboardStats.recordKill.kills)})`],
    ["Pacifista", `${dashboardStats.pacifist.names} (${formatInt(dashboardStats.pacifist.zeroMatches)})`],
    ["Win Rate", `${format1(dashboardStats.winRate)}%`],
    ["Kill Promedio Global", format1(dashboardStats.globalAvgKills)],
    ["Partida más sangrienta", `${dashboardStats.bloodiest.label} (${formatInt(dashboardStats.bloodiest.kills)})`],
    ["Mayor aporte (Sharpe)", dashboardStats.bestSharpePlayer],
    ["Menor aporte (Sharpe)", dashboardStats.worstSharpePlayer]
  ];

  dashboardEl.innerHTML = cards
    .map(([title, value]) => `
      <div class="kpi-card">
        <div class="kpi-title">${title}</div>
        <div class="kpi-value">${formatKpiValue(value)}</div>
      </div>
    `)
    .join("");
  scheduleTextFit();
}

function renderPlayerSummaryTable() {
  const headers = [
    "Jugador",
    "Posición",
    "Kills Totales",
    "Promedio",
    "Mejor partida",
    "Partidas lideradas",
    "% del total",
    "Consistencia (σ)",
    "Sharpe grupal"
  ];

  const rows = playerStats.map(s => `
    <tr>
      <td>${s.player}</td>
      <td>${formatInt(s.position)}</td>
      <td>${formatInt(s.totalKills)}</td>
      <td>${format1(s.avg)}</td>
      <td>${formatInt(s.bestMatch)}</td>
      <td>${formatInt(s.ledMatches)}</td>
      <td>${format1(s.pctTotal)}%</td>
      <td>${format1(s.std)}</td>
      <td>${s.sharpe === null ? "N/A" : format1(s.sharpe)}</td>
    </tr>
  `).join("");

  summaryEl.innerHTML = `
    <h3>Resumen de Totales</h3>
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderHeatmap() {
  if (maxMatches === 0) {
    heatmapEl.innerHTML = "<h3>Heatmap de Partidas</h3><p class='empty-note'>Sin partidas completas para mostrar.</p>";
    return;
  }

  const allVals = playerStats.flatMap(s => s.series);
  const maxVal = allVals.length ? Math.max(...allVals) : 1;

  const header = compactLabels.map((l, i) => `<th class="${winMarkers[i] ? "match-win-col" : ""}">${l}${winMarkers[i] ? " 🏆" : ""}</th>`).join("");
  const body = playerStats.map(s => {
    const cells = s.series.map(v => {
      const ratio = maxVal > 0 ? (v / maxVal) : 0;
      const alpha = (0.15 + ratio * 0.7).toFixed(2);
      return `<td style="background: rgba(119, 120, 109, ${alpha})">${formatInt(v)}</td>`;
    }).join("");
    return `<tr><td>${s.player}</td>${cells}</tr>`;
  }).join("");

  heatmapEl.innerHTML = `
    <h3>Heatmap de Partidas</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Jugador</th>${header}</tr></thead>
        <tbody>${body}<tr class="position-row"><th scope="row">Posición del equipo</th>${matchPositions.map(position => `<td>${position === null ? "—" : formatInt(position)}</td>`).join("")}</tr></tbody>
      </table>
    </div>
  `;
}

function destroyCharts() {
  [totalKillsChart, avgKillsChart, trendChart, cumulativeChart, ledChart, positionChart].forEach(ch => {
    if (ch) ch.destroy();
  });
  totalKillsChart = null;
  avgKillsChart = null;
  trendChart = null;
  cumulativeChart = null;
  ledChart = null;
  positionChart = null;
}

function renderCharts() {
  if (typeof Chart === "undefined") {
    document.querySelectorAll(".chart-card").forEach(card => {
      if (!card.querySelector(".empty-note")) {
        card.insertAdjacentHTML("beforeend", "<p class='empty-note'>No se pudo cargar Chart.js.</p>");
      }
    });
    return;
  }

  destroyCharts();

  const labels = playerStats.map(s => s.player);
  const colors = labels.map((_, idx) => PLAYER_COLORS[idx % PLAYER_COLORS.length]);
  const avgs = playerStats.map(s => Number(format1(s.avg)));
  const led = playerStats.map(s => Number(format1(s.ledMatches)));

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#C6C5B9" } }
    },
    scales: {
      x: { ticks: { color: "#C6C5B9" }, grid: { color: "rgba(198,197,185,0.08)" } },
      y: { ticks: { color: "#C6C5B9" }, grid: { color: "rgba(198,197,185,0.08)" } }
    }
  };

  const hasPositions = matchPositions.some(position => position !== null);
  document.getElementById("position-empty").hidden = hasPositions;
  document.getElementById("chart-position").hidden = !hasPositions;
  if (hasPositions) {
    positionChart = new Chart(document.getElementById("chart-position"), {
      type: "line",
      data: {
        labels: compactLabels,
        datasets: [{
          label: "Posición del equipo",
          data: matchPositions,
          borderColor: "#F5D21B",
          backgroundColor: "#F5D21B",
          pointBackgroundColor: "#F5D21B",
          pointRadius: 5,
          borderWidth: 2,
          spanGaps: false,
          tension: 0
        }]
      },
      options: {
        ...baseOpts,
        scales: {
          x: baseOpts.scales.x,
          y: { ...baseOpts.scales.y, reverse: true, min: 1, suggestedMax: 5, ticks: { color: "#C6C5B9", precision: 0 } }
        }
      }
    });
  }

  avgKillsChart = new Chart(document.getElementById("chart-avg-kills"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Kills Promedio",
        data: avgs,
        backgroundColor: colors,
        borderColor: "#F4F2E9",
        borderWidth: 1.2
      }]
    },
    options: baseOpts
  });

  trendChart = new Chart(document.getElementById("chart-trend"), {
    type: "line",
    data: {
      labels: compactLabels,
      datasets: playerStats.map((s, idx) => ({
        label: s.player,
        data: s.series.map(v => Number(format1(v))),
        tension: 0.25,
        fill: false,
        borderWidth: 2,
        borderColor: colors[idx % colors.length],
        pointBackgroundColor: "#F4F2E9",
        pointBorderColor: colors[idx % colors.length],
        pointRadius: 3
      }))
    },
    options: baseOpts
  });

  cumulativeChart = new Chart(document.getElementById("chart-cumulative"), {
    type: "line",
    data: {
      labels: compactLabels,
      datasets: playerStats.map((s, idx) => {
        let running = 0;
        const cum = s.series.map(v => {
          running += Number(v || 0);
          return running;
        });
        return {
          label: s.player,
          data: cum,
          tension: 0.25,
          fill: false,
          borderWidth: 2,
          borderColor: colors[idx % colors.length],
          pointBackgroundColor: "#F4F2E9",
          pointBorderColor: colors[idx % colors.length],
          pointRadius: 3
        };
      })
    },
    options: baseOpts
  });

  ledChart = new Chart(document.getElementById("chart-led"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        label: "Partidas lideradas",
        data: led,
        backgroundColor: colors,
        borderColor: "#11120F",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#C6C5B9" } }
      }
    }
  });
}

function renderLeaderboard() {
  container.innerHTML = "";
  if (!rowsTotal.length) return;

  const top = rowsTotal.slice(0, MAX_PLAYERS);
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
      const currentKill = Number.isFinite(Number(arr[matchToShow])) ? Number(arr[matchToShow]) : 0;

      const matchMain = document.createElement("div");
      matchMain.className = "match-main";
      matchMain.textContent = `${compactLabels[matchToShow] ?? "M1"}: ${formatInt(currentKill)}`;

      const layout = document.createElement("div");
      layout.className = "match-layout";

      const badgeCol = document.createElement("div");
      badgeCol.className = "badge-col";

      if (isWinMatch) {
        matchDiv.classList.add("win-match");
        const winBadge = document.createElement("span");
        winBadge.className = "tag win-tag";
        winBadge.textContent = "🏆";
        badgeCol.appendChild(winBadge);
        if (matchToShow !== lastShownMatch) {
          for (let i = 0; i < 40; i++) {
            const spark = document.createElement("span");
            spark.className = "win-spark";
            spark.style.setProperty("--dx", `${(Math.random() * 180 - 90).toFixed(1)}px`);
            spark.style.setProperty("--dy", `${(Math.random() * 140 - 70).toFixed(1)}px`);
            spark.style.setProperty("--d", `${(420 + Math.random() * 240).toFixed(0)}ms`);
            spark.style.setProperty("--s", `${(0.35 + Math.random() * 1.2).toFixed(2)}`);
            spark.style.left = `${(Math.random() * 100).toFixed(1)}%`;
            spark.style.top = `${(Math.random() * 100).toFixed(1)}%`;
            matchDiv.appendChild(spark);
            setTimeout(() => spark.remove(), 700);
          }
        }
      }

      const numericKill = Number.isFinite(Number(currentKill)) ? Number(currentKill) : null;
      if (bestKill !== null && numericKill !== null && numericKill > 0 && numericKill === bestKill) {
        rowEl.classList.add("killer-row");
        const killerBadge = document.createElement("span");
        killerBadge.className = "tag killer-tag";
        killerBadge.textContent = "💀";
        badgeCol.appendChild(killerBadge);
      }

      if (numericKill === 0) {
        const peaceBadge = document.createElement("span");
        peaceBadge.className = "tag peace-tag";
        peaceBadge.textContent = "☮️";
        badgeCol.appendChild(peaceBadge);
      }

      if (badgeCol.childElementCount === 0) {
        const empty = document.createElement("span");
        empty.className = "tag tag-empty";
        empty.textContent = "•";
        badgeCol.appendChild(empty);
      }

      layout.appendChild(matchMain);
      layout.appendChild(badgeCol);
      matchDiv.appendChild(layout);

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
  scheduleTextFit();
}

async function cargarDatos() {
  try {
    const [j1, j2] = await Promise.all([fetchSheet(url1), fetchSheet(url2)]);

    rowsTotal = (j1.table.rows || [])
      .map(r => ({
        name: (r.c?.[0]?.v ?? "Sin nombre").toString().trim(),
        score: Number.isFinite(Number(r.c?.[1]?.v)) ? Number(r.c[1].v) : 0
      }))
      .filter(r => r.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PLAYERS);

    activePlayers = [...rowsTotal];

    const rawMatches = {};
    const allRows = j2.table.rows || [];

    // filas jugadores: 1..4 de tabla (2..5 en hoja)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const row = allRows[i];
      if (!row) continue;
      const name = (row.c?.[0]?.v ?? "").toString().trim();
      if (!name) continue;

      const arr = Array(MAX_MATCHES).fill(null);
      for (let col = 1; col <= MAX_MATCHES; col++) {
        const cell = row.c?.[col]?.v;
        arr[col - 1] = toNumberOrNull(cell);
      }
      rawMatches[normalizeName(name)] = arr;
    }

    // Fila Resultado: localizar por nombre y conservar compatibilidad con fila 6.
    const rawPositions = Array(MAX_MATCHES).fill(null);
    const winRow = allRows.find(row => ["resultado", "resultados", "win"].includes(normalizeName(row.c?.[0]?.v))) || allRows[4];
    for (let col = 1; col <= MAX_MATCHES; col++) {
      const raw = winRow?.c?.[col]?.v;
      rawPositions[col - 1] = toPositionOrNull(raw);
    }

    rebuildDerivedData(rawMatches, rawPositions);

    renderLeaderboard();
    renderDashboard();
    renderCaptain();
    renderPlayerSummaryTable();
    renderHeatmap();
    renderCharts();
  } catch (err) {
    container.innerHTML = `<div style="color:red;padding:10px">⚠️ Error cargando datos: ${err.message}</div>`;
    console.error(err);
  }
}

cargarDatos();

setInterval(() => {
  if (maxMatches <= 0) return;
  currentMatchIndex = (currentMatchIndex + 1) % maxMatches;
  renderLeaderboard();
}, 5000);

setInterval(() => {
  cargarDatos();
}, 30000);

if (exportBtn) {
  exportBtn.addEventListener("click", exportToImage);
}

if (typeof window !== "undefined") window.addEventListener("resize", scheduleTextFit);
document.fonts?.ready.then(scheduleTextFit);
