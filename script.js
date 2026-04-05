const sheetID = "1K1i2yCRTwXyU_CnqZz9QvP8ykzXDB-ZNRibvEmjmLQs";
const sheet1 = "Sheet1"; // activos + kills totales
const sheet2 = "Sheet2"; // partidas por jugador + fila WIN
const url1 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet1}`;
const url2 = `https://docs.google.com/spreadsheets/d/${sheetID}/gviz/tq?tqx=out:json&sheet=${sheet2}`;

const MAX_PLAYERS = 4;
const MAX_MATCHES = 24;

const container = document.getElementById("leaderboard");
const dashboardEl = document.getElementById("dashboard");
const summaryEl = document.getElementById("summary-table");
const matchesEl = document.getElementById("matches-tables");
const heatmapEl = document.getElementById("heatmap");

// estado
let rowsTotal = []; // [{name, score}] de Sheet1 (jugadores activos)
let rowsMatches = {}; // nombre_normalizado => [m1..mn] compactadas
let winMarkers = []; // [bool] compactadas
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
let ledChart = null;

function parseGviz(text) {
  return JSON.parse(text.substr(47).slice(0, -2));
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

function rebuildDerivedData(rawPlayerMatches, rawWinMarkers) {
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

  winMarkers = validIndices.map(i => !!rawWinMarkers[i]);
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

  const bestPlayer = playerStats.length
    ? playerStats.reduce((a, b) => (b.totalKills > a.totalKills ? b : a)).player
    : "N/A";

  const sharpeValid = playerStats.filter(s => s.sharpe !== null && Number.isFinite(s.sharpe));
  const bestSharpe = sharpeValid.length
    ? sharpeValid.reduce((a, b) => (b.sharpe > a.sharpe ? b : a))
    : null;
  const worstSharpe = sharpeValid.length
    ? sharpeValid.reduce((a, b) => (b.sharpe < a.sharpe ? b : a))
    : null;

  const globalAvgKills = matchesPlayed > 0 ? (teamTotalKills / matchesPlayed) : 0;
  const winRate = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

  dashboardStats = {
    matchesPlayed,
    wins,
    teamTotalKills,
    bestPlayer,
    globalAvgKills,
    bloodiest,
    bestSharpePlayer: bestSharpe ? `${bestSharpe.player} (${format1(bestSharpe.sharpe)})` : "N/A",
    worstSharpePlayer: worstSharpe ? `${worstSharpe.player} (${format1(worstSharpe.sharpe)})` : "N/A",
    winRate
  };
}

function renderDashboard() {
  if (!dashboardStats) {
    dashboardEl.innerHTML = "";
    return;
  }

  const cards = [
    ["Partidas Jugadas", dashboardStats.matchesPlayed],
    ["Victorias", dashboardStats.wins],
    ["Kills Totales", dashboardStats.teamTotalKills],
    ["Mejor Jugador", dashboardStats.bestPlayer],
    ["Win Rate", `${format1(dashboardStats.winRate)}%`],
    ["Kill Promedio Global", format1(dashboardStats.globalAvgKills)],
    ["Partida más sangrienta", `${dashboardStats.bloodiest.label} (${format1(dashboardStats.bloodiest.kills)})`],
    ["Mayor aporte (Sharpe)", dashboardStats.bestSharpePlayer],
    ["Menor aporte (Sharpe)", dashboardStats.worstSharpePlayer]
  ];

  dashboardEl.innerHTML = cards
    .map(([title, value]) => `
      <div class="kpi-card">
        <div class="kpi-title">${title}</div>
        <div class="kpi-value">${value}</div>
      </div>
    `)
    .join("");
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
      <td>${s.position}</td>
      <td>${format1(s.totalKills)}</td>
      <td>${format1(s.avg)}</td>
      <td>${format1(s.bestMatch)}</td>
      <td>${format1(s.ledMatches)}</td>
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

function buildMatchesTable(start, end, title) {
  const labels = compactLabels.slice(start, end);
  const winSlice = winMarkers.slice(start, end);

  const thead = `
    <tr>
      <th>Jugador</th>
      ${labels.map((l, i) => `<th class="${winSlice[i] ? "match-win-col" : ""}">${l}${winSlice[i] ? " 🏆" : ""}</th>`).join("")}
    </tr>
  `;

  const body = playerStats.map(s => {
    const vals = s.series.slice(start, end);
    return `
      <tr>
        <td>${s.player}</td>
        ${vals.map((v, i) => `<td class="${winSlice[i] ? "match-win-cell" : ""}">${format1(v)}</td>`).join("")}
      </tr>
    `;
  }).join("");

  return `
    <section class="match-table-block">
      <h3>${title}</h3>
      <div class="table-wrap">
        <table>
          <thead>${thead}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMatchesTables() {
  if (maxMatches === 0) {
    matchesEl.innerHTML = "<h3>Resumen de Partidas</h3><p class='empty-note'>Sin partidas completas para mostrar.</p>";
    return;
  }

  const first = buildMatchesTable(0, Math.min(12, maxMatches), "Resumen de Partidas (M1-M12)");
  const second = maxMatches > 12
    ? buildMatchesTable(12, Math.min(24, maxMatches), "Resumen de Partidas (M13-M24)")
    : "";

  matchesEl.innerHTML = `<h2 class="section-title">Resumen de Partidas</h2>${first}${second}`;
}

function renderHeatmap() {
  if (maxMatches === 0) {
    heatmapEl.innerHTML = "";
    return;
  }

  const allVals = playerStats.flatMap(s => s.series);
  const maxVal = allVals.length ? Math.max(...allVals) : 1;

  const header = compactLabels.map((l, i) => `<th class="${winMarkers[i] ? "match-win-col" : ""}">${l}${winMarkers[i] ? " 🏆" : ""}</th>`).join("");
  const body = playerStats.map(s => {
    const cells = s.series.map(v => {
      const ratio = maxVal > 0 ? (v / maxVal) : 0;
      const alpha = (0.15 + ratio * 0.7).toFixed(2);
      return `<td style="background: rgba(105, 201, 185, ${alpha})">${format1(v)}</td>`;
    }).join("");
    return `<tr><td>${s.player}</td>${cells}</tr>`;
  }).join("");

  heatmapEl.innerHTML = `
    <h3>Heatmap de Kills por Jugador y Partida</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Jugador</th>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function destroyCharts() {
  [totalKillsChart, avgKillsChart, trendChart, ledChart].forEach(ch => {
    if (ch) ch.destroy();
  });
  totalKillsChart = null;
  avgKillsChart = null;
  trendChart = null;
  ledChart = null;
}

function renderCharts() {
  if (typeof Chart === "undefined") return;

  destroyCharts();

  const labels = playerStats.map(s => s.player);
  const totals = playerStats.map(s => Number(format1(s.totalKills)));
  const avgs = playerStats.map(s => Number(format1(s.avg)));
  const led = playerStats.map(s => Number(format1(s.ledMatches)));

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#dce7e4" } }
    },
    scales: {
      x: { ticks: { color: "#dce7e4" }, grid: { color: "rgba(255,255,255,0.08)" } },
      y: { ticks: { color: "#dce7e4" }, grid: { color: "rgba(255,255,255,0.08)" } }
    }
  };

  totalKillsChart = new Chart(document.getElementById("chart-total-kills"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Kills Totales",
        data: totals,
        backgroundColor: "rgba(105, 201, 185, 0.7)",
        borderColor: "#69c9b9",
        borderWidth: 1
      }]
    },
    options: baseOpts
  });

  avgKillsChart = new Chart(document.getElementById("chart-avg-kills"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Kills Promedio",
        data: avgs,
        backgroundColor: "rgba(241, 196, 15, 0.7)",
        borderColor: "#f1c40f",
        borderWidth: 1
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
        borderColor: ["#69c9b9", "#f1c40f", "#8be9f6", "#f39c12"][idx % 4],
        pointRadius: 2
      }))
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
        backgroundColor: ["#69c9b9", "#f1c40f", "#8be9f6", "#f39c12"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dce7e4" } }
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
      const currentKill = arr[matchToShow];

      const matchMain = document.createElement("div");
      matchMain.className = "match-main";
      matchMain.textContent = `${compactLabels[matchToShow] ?? "M1"}: ${currentKill ?? "—"}`;
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
        killerBadge.textContent = "K";
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

    // fila WIN: 5 de tabla (6 en hoja)
    const rawWin = Array(MAX_MATCHES).fill(false);
    const winRow = allRows[4];
    for (let col = 1; col <= MAX_MATCHES; col++) {
      const raw = winRow?.c?.[col]?.v;
      rawWin[col - 1] = raw !== null && raw !== undefined && String(raw).trim() !== "";
    }

    rebuildDerivedData(rawMatches, rawWin);

    renderLeaderboard();
    renderDashboard();
    renderPlayerSummaryTable();
    renderMatchesTables();
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
