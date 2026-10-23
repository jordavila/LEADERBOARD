const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
function element() {
  return {
    innerHTML: '', hidden: false, childNodes: [], dataset: {}, style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name] ?? null; },
    replaceChildren(...nodes) { this.childNodes = nodes; },
    appendChild(node) { this.childNodes.push(node); },
    click() {},
  };
}
const charts = [];
const context = vm.createContext({
  console, Intl, Date, setInterval() {}, setTimeout() {},
  fetch: () => new Promise(() => {}),
  requestAnimationFrame: resolve => resolve(),
  html2canvas: async () => ({ toDataURL: () => 'data:image/png;base64,test' }),
  alert: message => { throw new Error(message); },
  Chart: function(target, config) { charts.push(config); this.destroy = () => {}; },
  document: {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => elements.get('toolbar'),
    querySelectorAll: () => [],
    createElement: () => element(),
    body: element(),
  },
});
elements.set('toolbar', element());
vm.runInContext(fs.readFileSync('script.js', 'utf8'), context);
const run = code => vm.runInContext(code, context);

run(`activePlayers = [{name:'A',score:9},{name:'B',score:5}];
rebuildDerivedData({a:[2,0,4,3,99], b:[1,1,2,1,null]}, [1,2,null,'1',1]);`);
assert.equal(run('maxMatches'), 4, 'Incomplete matches remain excluded');
assert.equal(run('dashboardStats.wins'), 2, 'Only numeric or numeric-string position 1 wins');
assert.equal(run('dashboardStats.avgPosition'), 4 / 3, 'Empty result excluded from denominator');
assert.equal(run('dashboardStats.teamTotalKills'), 14);
assert.equal(run('dashboardStats.globalAvgKills'), 3.5);
assert.equal(run('dashboardStats.winRate'), 50);
assert.equal(run('dashboardStats.captains[0].player'), 'A');
assert.equal(run(`toPositionOrNull(' ')`), null);
assert.equal(run(`toPositionOrNull('WIN')`), null);
assert.equal(run('toPositionOrNull(0)'), null);
assert.equal(run('toPositionOrNull(-1)'), null);
assert.equal(run('toPositionOrNull(1.5)'), null);
run('renderCharts(); renderCaptain(); renderDashboard(); renderHeatmap();');
assert.ok(elements.get('source-sheet-link').href.endsWith('/edit'));
assert.ok(elements.get('dashboard').innerHTML.includes('Posición Promedio'));
assert.ok(elements.get('heatmap').innerHTML.includes('Posición del equipo'));
const position = charts.find(chart => chart.data.datasets[0].label === 'Posición del equipo');
assert.equal(position.options.scales.y.reverse, true);
assert.equal(position.data.datasets[0].data[2], null, 'Unknown position stays a gap');
assert.equal(elements.get('captain').childNodes[0].childNodes[0].childNodes[0].src, 'assets/captains/DEFAULT.png');

assert.equal(run(`[{player:'A',totalKills:10,sharpe:0.2,bestMatch:9},{player:'B',totalKills:10,sharpe:0.4,bestMatch:6}].sort(compareCaptains)[0].player`), 'B');
assert.equal(run(`[{player:'A',totalKills:10,sharpe:0.4,bestMatch:6},{player:'B',totalKills:10,sharpe:0.4,bestMatch:9}].sort(compareCaptains)[0].player`), 'B');
assert.equal(run(`[{player:'A',totalKills:10,sharpe:null,bestMatch:9},{player:'B',totalKills:10,sharpe:0,bestMatch:6}].sort(compareCaptains)[0].player`), 'B');
assert.equal(run(`[{player:'A',totalKills:10,sharpe:null,bestMatch:6},{player:'B',totalKills:10,sharpe:null,bestMatch:9}].sort(compareCaptains)[0].player`), 'B');
assert.equal(run(`compareCaptains({player:'Z',totalKills:10,sharpe:0,bestMatch:6},{player:'A',totalKills:10,sharpe:0,bestMatch:6})`), 0, 'Names must not break a complete tie');

for (const count of [2, 3, 4]) {
  run(`activePlayers = ['JADO82','MANQUINHO','ANDRESFU','HAROLDO'].slice(0,${count}).map(name=>({name,score:12}));
    rebuildDerivedData(Object.fromEntries(activePlayers.map(player=>[normalizeName(player.name),[3,9]])), [4,1]);
    renderCaptain(); renderDashboard();`);
  assert.equal(run('dashboardStats.captains.length'), count, 'Every equally performing player shares the award');
  assert.equal(elements.get('captain').childNodes.length, count, 'Every shared winner has an avatar');
  assert.ok(elements.get('dashboard').innerHTML.includes('compartido'));
  const firstCard = elements.get('captain').childNodes[0];
  assert.ok(firstCard.childNodes[0].childNodes[0].src.endsWith('JADO82-v2.png'));
  assert.ok(firstCard.childNodes[1].textContent.includes('COMPARTIDO'));
}
assert.ok(run(`formatKpiValue('JADO82, MANQUINHO (9)')`).includes('>MANQUINHO</span>'), 'Each whole name receives a separate fitting line');
assert.ok(run(`formatKpiValue('<script> (9)')`).includes('&lt;script&gt;'), 'Names remain escaped');
assert.equal(run(`selectCaptains([{player:'Z',totalKills:10,sharpe:.4,bestMatch:6},{player:'A',totalKills:10,sharpe:.4,bestMatch:6},{player:'B',totalKills:10,sharpe:.2,bestMatch:9}]).length`), 2, 'Share only after every performance tie-breaker is exhausted');
assert.equal(run(`selectCaptains([{player:'Z',totalKills:10,sharpe:null,bestMatch:6},{player:'A',totalKills:10,sharpe:null,bestMatch:6}]).length`), 2, 'Unavailable Sharpes can tie');
run(`rebuildDerivedData({a:[1,2],b:[2,3]}, [null,'']); renderCharts();`);
assert.equal(run('dashboardStats.wins'), 0);
assert.equal(run('dashboardStats.avgPosition'), null);
assert.equal(elements.get('position-empty').hidden, false);
run('rebuildDerivedData({}, []); renderCaptain();');
assert.equal(run('dashboardStats.captains.length'), 0);
assert.equal(elements.get('captain').hidden, true);

(async () => {
  const button = element();
  const link = element();
  elements.get('toolbar').childNodes = [button, link];
  await run('exportToImage()');
  assert.strictEqual(elements.get('toolbar').childNodes[0], button, 'Export preserves original button and listeners');
  assert.strictEqual(elements.get('toolbar').childNodes[1], link);
  await run('exportToImage()');
  assert.strictEqual(elements.get('toolbar').childNodes[0], button, 'Repeated exports keep button working');
  console.log('PASS: positions, wins, averages, captain tie-breaks, chart gaps, empty data, repeated export');
})().catch(error => { console.error(error); process.exitCode = 1; });
