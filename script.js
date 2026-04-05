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
const PLAYER_COLORS = ["#ff3b30", "#00a2ff", "#00d26a", "#ffd60a"];

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

  const bestPlayerStat = playerStats.length
    ? playerStats.reduce((a, b) => (b.totalKills > a.totalKills ? b : a))
    : null;
  const bestPlayer = bestPlayerStat ? `${bestPlayerStat.player} (${format1(bestPlayerStat.totalKills)})` : "N/A";

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

  dashboardStats = {
    matchesPlayed,
    wins,
    teamTotalKills,
    bestPlayer: bestPlayerStat ? `${bestPlayerStat.player} (${formatInt(bestPlayerStat.totalKills)})` : "N/A",
    globalAvgKills,
    bloodiest,
    recordKill,
    pacifist,
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
    ["Partidas Jugadas", formatInt(dashboardStats.matchesPlayed)],
    ["Victorias", formatInt(dashboardStats.wins)],
    ["Kills Totales", formatInt(dashboardStats.teamTotalKills)],
    ["Mejor Jugador", dashboardStats.bestPlayer],
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
      return `<td style="background: rgba(105, 201, 185, ${alpha})">${formatInt(v)}</td>`;
    }).join("");
    return `<tr><td>${s.player}</td>${cells}</tr>`;
  }).join("");

  heatmapEl.innerHTML = `
    <h3>Heatmap de Partidas</h3>
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
        backgroundColor: colors,
        borderColor: "#ffffff",
        borderWidth: 1.2
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
        backgroundColor: colors,
        borderColor: "#ffffff",
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
        pointBackgroundColor: "#ffffff",
        pointBorderColor: colors[idx % colors.length],
        pointRadius: 3
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
        backgroundColor: colors,
        borderColor: "#111",
        borderWidth: 1
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
