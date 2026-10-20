import './style.css';
import { barChart, hideTip, lineChart, sparkline, type Bar } from './charts';
import { ago, esc, idr, num, pct, price as fmtPrice, qty as fmtQty, setPrivacy, short } from './format';
import { FX, GOLD, MARKETS, SILVER, fetchQuotes, marketOpen, normalizeSymbol, yahooQuote } from './prices';
import { emptyDB, load, normalize, record, sample, save, today, uid } from './store';
import type { AssetClass, DB, Holding } from './types';
import { CLASSES, LOT, classLabel, groupBy, perGram, symbolsFor, totals, value, type Totals, type Valued } from './valuation';

// ---------------------------------------------------------------- state

let db: DB = load();
let rows: Valued[] = [];
let fresh = new Set<string>();
let errors: Record<string, string> = {};
let lastFetch = 0;
let fetching = false;
let prevPrice = new Map<string, number>();
const ui = {
  sort: 'value' as keyof typeof SORTS,
  dir: -1,
  filter: 'all' as AssetClass | 'all',
  range: (db.history.length > 2 ? '1m' : '1d') as Range,
  open: new Set<string>(),
};
type Range = '1d' | '1m' | '3m' | '1y' | 'all';
let installEvt: (Event & { prompt: () => void }) | null = null;

const app = document.getElementById('app')!;
const modalRoot = document.getElementById('modal')!;

// ---------------------------------------------------------------- icons

const I = {
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/><path d="M21 11h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z"/>',
  today: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  growth: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/><path d="M20 8V4h-4" transform="translate(0 4)"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  pie: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  line: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bars: '<path d="M3 3v18h18"/><path d="M8 17V9M13 17V5M18 17v-6"/>',
  bank: '<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>',
  movers: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  install: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
};
const icon = (k: keyof typeof I, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

const pill = (v: number, text: string) => {
  const c = v > 0.00001 ? 'up' : v < -0.00001 ? 'down' : 'flat';
  const arrow = c === 'up' ? '↗' : c === 'down' ? '↘' : '→';
  return `<span class="pill ${c}">${arrow} ${text}</span>`;
};
const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

// ---------------------------------------------------------------- data

function revalue(): void {
  rows = db.holdings.map((h) => value(h, db.quotes, db.settings, fresh));
}

async function refresh(manual = false): Promise<void> {
  if (fetching) return;
  if (!navigator.onLine && !manual) return;
  fetching = true;
  renderStatus();
  const syms = [...symbolsFor(db.holdings), GOLD, SILVER, ...MARKETS];
  const res = await fetchQuotes(syms, db.settings.proxyBase);
  fetching = false;
  lastFetch = Date.now();
  errors = res.errors;
  fresh = new Set(Object.keys(res.quotes));
  prevPrice = new Map(rows.map((r) => [r.h.id, r.price]));
  Object.assign(db.quotes, res.quotes);
  revalue();
  if (db.holdings.length && fresh.size) {
    const t = totals(rows);
    record(db, { t: Date.now(), v: Math.round(t.value), c: Math.round(t.cost) });
  }
  save(db);
  render();
}

function persist(): void {
  save(db);
  revalue();
  render();
}

// ---------------------------------------------------------------- render

function render(): void {
  setPrivacy(db.settings.privacy);
  applyTheme();
  if (!db.holdings.length) {
    app.innerHTML = header() + emptyState();
    bind();
    return;
  }
  const t = totals(rows);
  app.innerHTML = `
    ${header()}
    ${banner()}
    <section class="kpis">${kpiNetWorth(t)}${kpiToday(t)}${kpiPL(t)}${panelMarkets()}${panelAlloc(t)}</section>
    <section class="row two">
      <article class="card" id="nw-card">${netWorthHead()}<div id="nw-chart" class="chart"></div></article>
      <article class="card">
        <div class="card-h"><h2>${icon('bars', 'accent')} Daily gain / loss</h2></div>
        <div class="legend"><span><i class="sw sq up"></i>Gain</span><span><i class="sw sq down"></i>Loss</span><span class="muted">Market moves only, deposits excluded</span></div>
        <div id="daily-chart" class="chart"></div>
      </article>
    </section>
    <section class="row">
      <article class="card">${holdingsTable(t)}</article>
    </section>
    <section class="row three">
      <article class="card">${byClass(t)}</article>
      <article class="card">${byAccount(t)}</article>
      <article class="card">${movers()}</article>
    </section>
    <footer class="foot">Prices: Yahoo Finance (IDX quotes may be delayed ~10 min), metals = COMEX futures × USD/IDR ÷ 31.1035 g.
      Bond prices are what you enter (retail SBN default to 100% of par). Data stays on this device.</footer>`;
  bind();
  drawCharts();
}

function header(): string {
  const d = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `<header class="top">
    <div class="brand"><div class="logo">${icon('growth')}</div><h1>Portofolio <span class="sub">· ${d}</span></h1></div>
    <div class="actions">
      <span id="status" class="status">${statusText()}</span>
      ${installEvt ? `<button class="btn ghost" data-act="install" title="Install app">${icon('install')}<span class="hide-sm">Install</span></button>` : ''}
      <button class="btn icon-btn" data-act="refresh" title="Refresh prices">${icon('refresh', fetching ? 'spin' : '')}</button>
      <button class="btn icon-btn" data-act="privacy" title="Hide amounts">${icon(db.settings.privacy ? 'eyeOff' : 'eye')}</button>
      <button class="btn icon-btn" data-act="settings" title="Settings">${icon('gear')}</button>
      <button class="btn primary" data-act="add">${icon('plus')}<span>Add</span></button>
    </div></header>`;
}

function statusText(): string {
  if (fetching) return '<i class="dot busy"></i>Updating…';
  if (!lastFetch) return '<i class="dot"></i>Waiting';
  const n = Object.keys(errors).length;
  if (!fresh.size) return `<i class="dot bad"></i>Offline · cached`;
  return `<i class="dot ${n ? 'warn' : 'ok'}"></i>${n ? 'Partly live' : 'Live'} · ${ago(lastFetch)}`;
}
function renderStatus(): void {
  const el = document.getElementById('status');
  if (el) el.innerHTML = statusText();
  const r = app.querySelector('[data-act="refresh"] .ic');
  r?.classList.toggle('spin', fetching);
}

function banner(): string {
  if (!lastFetch || fetching) return '';
  const failed = Object.keys(errors).filter((s) => !MARKETS.includes(s));
  if (!failed.length) return '';
  const all = !fresh.size;
  return `<div class="banner ${all ? 'bad' : 'warn'}">
    <b>${all ? 'Could not reach any price source.' : `No live price for ${failed.map(esc).join(', ')}.`}</b>
    Showing the last known prices. ${all ? 'Run the app with <code>npm run dev</code>, or deploy the free proxy in <code>worker/</code> and paste its URL in <a href="#" data-act="settings">Settings</a>.' : 'Check the ticker, or set a manual price on the holding.'}
  </div>`;
}

function emptyState(): string {
  return `<section class="empty card">
    <div class="logo big">${icon('wallet')}</div>
    <h2>Track everything you own, live</h2>
    <p>Add Indonesian and US stocks, government bonds, gold, silver and cash. Prices refresh automatically,
      so 1 lot of BBCA or 5 g of gold is always valued at today's price.</p>
    <div class="row-btns"><button class="btn primary" data-act="add">${icon('plus')}Add your first holding</button>
    <button class="btn" data-act="sample">Load a sample portfolio</button></div>
  </section>`;
}

function kpiNetWorth(t: Totals): string {
  const goal = db.settings.goal;
  const p = goal ? (t.value / goal) * 100 : 0;
  const reached = goal && t.value >= goal;
  return `<article class="card kpi">
    <div class="kpi-top"><div class="kpi-ic">${icon('wallet')}</div><span class="badge ${reached ? '' : 'soft'}">${reached ? 'Goal reached' : 'Growing'}</span></div>
    <div class="big">${idr(t.value)}</div>
    <div class="kpi-label">Net worth ${pill(t.dayPct, pct(Math.abs(t.dayPct), 2, false))}</div>
    ${goal ? `<div class="progress"><div class="fill" style="width:${Math.min(100, p)}%"></div><span>${pct(p, 1, false)} of ${idr(goal)}</span></div>
    <div class="kpi-notes"><div>${reached ? `Above goal by <b>${idr(t.value - goal)}</b>` : `<b>${idr(goal - t.value)}</b> to go`}</div></div>` : ''}
  </article>`;
}

function kpiToday(t: Totals): string {
  const live = rows.filter((r) => r.day !== 0).sort((a, b) => b.dayPct - a.dayPct);
  const best = live[0], worst = live[live.length - 1];
  const line = (r: Valued | undefined, lbl: string) => r ? `<div class="kv"><span class="muted">${lbl}</span><span>${esc(r.h.symbol.replace('.JK', '') || r.h.name)} <b class="${tone(r.dayPct)}">${pct(r.dayPct, 2)}</b></span></div>` : '';
  return `<article class="card kpi">
    <div class="kpi-top"><div class="kpi-ic">${icon('today')}</div><span class="badge ${t.day >= 0 ? '' : 'neg'}">${t.day >= 0 ? 'Up today' : 'Down today'}</span></div>
    <div class="big ${tone(t.day)}">${idr(t.day, true)}</div>
    <div class="kpi-label">Today's change ${pill(t.dayPct, pct(Math.abs(t.dayPct), 2, false))}</div>
    <div class="kpi-notes">${line(best, 'Best')}${best !== worst ? line(worst, 'Worst') : ''}
      <div class="kv"><span class="muted">Markets</span><span>${mkt('IDX', 'idx')} ${mkt('US', 'us')}</span></div></div>
  </article>`;
}
const mkt = (name: string, m: 'idx' | 'us') => {
  const o = marketOpen(m);
  return `<span class="mkt ${o ? 'open' : ''}" title="${o ? 'Open' : 'Closed'}"><i></i>${name}</span>`;
};

function kpiPL(t: Totals): string {
  return `<article class="card kpi">
    <div class="kpi-top"><div class="kpi-ic">${icon('growth')}</div><span class="badge ${t.pl >= 0 ? '' : 'neg'}">${t.pl >= 0 ? 'In profit' : 'In loss'}</span></div>
    <div class="big ${tone(t.pl)}">${idr(t.pl, true)}</div>
    <div class="kpi-label">Unrealized P/L ${pill(t.plPct, pct(Math.abs(t.plPct), 1, false))}</div>
    <div class="kpi-notes">
      <div class="kv"><span class="muted">Cost basis</span><b>${idr(t.cost)}</b></div>
      ${t.income ? `<div class="kv"><span class="muted">Bond coupons / yr</span><b>${idr(t.income)}</b></div>` : ''}
    </div>
  </article>`;
}

function panelMarkets(): string {
  const q = db.quotes;
  const fx = q[FX]?.price ?? 0, fxPrev = q[FX]?.prev ?? fx;
  const metal = (sym: string, adj: number) => {
    const x = q[sym];
    if (!x || !fx) return null;
    const now = perGram(x.price, fx, adj), before = perGram(x.prev, fxPrev, adj);
    return { now, chg: before ? ((now - before) / before) * 100 : 0 };
  };
  const item = (ic: string, top: string, sub: string, chg: number | null) =>
    `<li><span class="li-ic">${ic}</span><div><b>${top}</b><span class="muted">${sub}</span></div>${chg == null ? '' : pill(chg, pct(Math.abs(chg), 2, false))}</li>`;
  const ch = (s: string) => (q[s] ? ((q[s].price - q[s].prev) / q[s].prev) * 100 : null);
  const g = metal(GOLD, db.settings.goldAdjPct), s = metal(SILVER, db.settings.silverAdjPct);
  return `<article class="card panel">
    <h3>${icon('globe')} Markets</h3>
    <ul class="list">
      ${item('$', fx ? `Rp ${num(fx)}` : '–', 'USD / IDR', ch(FX))}
      ${item('Au', g ? `Rp ${num(g.now)}` : '–', 'Gold / gram', g?.chg ?? null)}
      ${item('Ag', s ? `Rp ${num(s.now)}` : '–', 'Silver / gram', s?.chg ?? null)}
      ${item('ID', q['^JKSE'] ? num(q['^JKSE'].price, 2) : '–', 'IHSG (JCI)', ch('^JKSE'))}
      ${item('US', q['^GSPC'] ? num(q['^GSPC'].price, 2) : '–', 'S&P 500', ch('^GSPC'))}
    </ul></article>`;
}

function panelAlloc(t: Totals): string {
  const g = groupBy(rows, (r) => r.h.cls);
  const items = CLASSES.filter((c) => g.has(c.id)).map((c) => {
    const x = g.get(c.id)!.t;
    return `<li><span class="sw c-${c.id}"></span><div><b>${pct(t.value ? (x.value / t.value) * 100 : 0, 1, false)}</b><span class="muted">${c.label}</span></div>${pill(x.dayPct, pct(Math.abs(x.dayPct), 1, false))}</li>`;
  });
  return `<article class="card panel"><h3>${icon('pie')} Allocation</h3><ul class="list">${items.join('')}</ul></article>`;
}

function netWorthHead(): string {
  const tabs: [Range, string][] = [['1d', 'Today'], ['1m', '1M'], ['3m', '3M'], ['1y', '1Y'], ['all', 'All']];
  return `<div class="card-h"><h2>${icon('line', 'accent')} Net worth</h2>
    <div class="seg">${tabs.map(([k, l]) => `<button data-range="${k}" class="${ui.range === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="legend"><span><i class="sw ln s1"></i>Net worth</span><span><i class="sw ln dash"></i>Cost basis</span></div>`;
}

const SORTS = {
  name: (r: Valued) => r.h.name.toLowerCase(),
  value: (r: Valued) => r.value,
  day: (r: Valued) => r.dayPct,
  pl: (r: Valued) => r.plPct,
  weight: (r: Valued) => r.value,
};

function qtyText(h: Holding): string {
  switch (h.cls) {
    case 'idx': return `${fmtQty(h.qty)} lot`;
    case 'us': return `${fmtQty(h.qty)} sh`;
    case 'gold': case 'silver': return `${fmtQty(h.qty, 3)} g`;
    case 'bond': return short(h.qty);
    case 'cash': return h.currency === 'USD' ? `$${fmtQty(h.qty, 2)}` : 'IDR';
  }
}
function priceText(r: Valued): string {
  const h = r.h;
  if (h.cls === 'bond') return `${num(r.price, 2)}%`;
  if (h.cls === 'cash') return h.currency === 'USD' ? `Rp ${num(r.price)}` : '–';
  return fmtPrice(r.price, r.currency);
}
function costText(h: Holding): string {
  if (h.cls === 'bond') return `${num(h.avgCost || 100, 2)}%`;
  if (h.cls === 'cash') return h.currency === 'USD' && h.avgCost ? `Rp ${num(h.avgCost)}` : '–';
  return fmtPrice(h.avgCost, h.cls === 'us' ? 'USD' : 'IDR');
}

function holdingsTable(t: Totals): string {
  const present = CLASSES.filter((c) => db.holdings.some((h) => h.cls === c.id));
  const list = rows.filter((r) => ui.filter === 'all' || r.h.cls === ui.filter);
  const key = SORTS[ui.sort];
  list.sort((a, b) => {
    const x = key(a), y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * ui.dir;
  });
  const th = (k: keyof typeof SORTS, label: string, cls = '') =>
    `<th class="${cls} sortable ${ui.sort === k ? 'on' : ''}" data-sort="${k}">${label}<span class="arr">${ui.sort === k ? (ui.dir < 0 ? '↓' : '↑') : '↕'}</span></th>`;
  const maxAbs = Math.max(1, ...list.map((r) => Math.abs(r.plPct)));
  const body = list.map((r) => {
    const h = r.h;
    const pp = prevPrice.get(h.id);
    const flash = pp != null && pp !== r.price ? (r.price > pp ? 'flash-up' : 'flash-down') : '';
    const sub = [h.cls === 'idx' ? h.symbol.replace('.JK', '') : h.symbol, h.account].filter(Boolean).map((s) => esc(s!)).join(' · ');
    const w = Math.min(50, (Math.abs(r.plPct) / maxAbs) * 50);
    return `<tr data-edit="${h.id}">
      <td><div class="asset"><span class="sw c-${h.cls}"></span><div><b>${esc(h.name)}</b><span class="muted small">${sub || classLabel(h.cls)}${h.manualPrice != null && h.cls !== 'bond' ? ' · manual' : ''}${r.stale && h.manualPrice == null && r.live ? ' · cached' : ''}</span></div></div></td>
      <td class="num">${qtyText(h)}</td>
      <td class="num muted">${costText(h)}</td>
      <td class="num ${flash}"><div class="px">${r.spark ? sparkline(r.spark, r.price >= r.prev) : ''}<span>${priceText(r)}</span></div></td>
      <td class="num strong">${idr(r.value)}</td>
      <td class="num muted">${pct(t.value ? (r.value / t.value) * 100 : 0, 1, false)}</td>
      <td class="num ${tone(r.dayPct)}">${r.day ? pct(r.dayPct, 2) : '–'}<span class="muted small block">${r.day ? short(r.day, true) : ''}</span></td>
      <td class="num"><div class="plbar"><span class="track"><i class="${r.pl >= 0 ? 'up' : 'down'}" style="width:${w}%;${r.pl >= 0 ? 'left:50%' : `right:50%`}"></i></span><span class="${tone(r.pl)}">${pct(r.plPct, 1)}</span></div><span class="muted small block">${short(r.pl, true)}</span></td>
    </tr>`;
  }).join('');
  return `<div class="card-h"><h2>${icon('list', 'accent')} Holdings</h2><span class="muted small">${db.holdings.length} assets · tap a row to edit</span></div>
    <div class="chips"><button data-filter="all" class="${ui.filter === 'all' ? 'on' : ''}">All</button>${present.map((c) => `<button data-filter="${c.id}" class="${ui.filter === c.id ? 'on' : ''}"><i class="sw c-${c.id}"></i>${c.label}</button>`).join('')}</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr>${th('name', 'Asset', 'left')}<th class="num">Qty</th><th class="num">Avg cost</th><th class="num">Price</th>${th('value', 'Value', 'num')}${th('weight', '% Port', 'num')}${th('day', 'Today', 'num')}${th('pl', 'P/L', 'num')}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
}

function byClass(t: Totals): string {
  const g = groupBy(rows, (r) => r.h.cls);
  const blocks = CLASSES.filter((c) => g.has(c.id)).map((c) => {
    const x = g.get(c.id)!;
    const share = t.value ? (x.t.value / t.value) * 100 : 0;
    const open = ui.open.has(c.id);
    return `<div class="alloc">
      <button class="alloc-h" data-toggle="${c.id}"><span class="sw c-${c.id}"></span>${c.label}${pill(x.t.dayPct, pct(Math.abs(x.t.dayPct), 2, false))}${icon('chev', open ? 'rot' : '')}</button>
      <div class="alloc-v"><span class="pctbig">${pct(share, 1, false)}</span><span class="muted">${idr(x.t.value)} · P/L <span class="${tone(x.t.pl)}">${pct(x.t.plPct, 1)}</span></span></div>
      <div class="meter"><i class="c-${c.id}" style="width:${share}%"></i></div>
      ${open ? `<ul class="sub">${x.rows.sort((a, b) => b.value - a.value).map((r) => `<li><span>${esc(r.h.name)}</span><span class="muted">${pct(x.t.value ? (r.value / x.t.value) * 100 : 0, 1, false)}</span><b>${idr(r.value)}</b></li>`).join('')}</ul>` : ''}
    </div>`;
  });
  return `<div class="card-h"><h2>${icon('pie', 'accent')} By asset class</h2></div>${blocks.join('')}`;
}

function byAccount(t: Totals): string {
  const g = [...groupBy(rows, (r) => r.h.account?.trim() || 'Unassigned')].sort((a, b) => b[1].t.value - a[1].t.value);
  return `<div class="card-h"><h2>${icon('bank', 'accent')} By account</h2></div>
    <div class="table-wrap"><table class="tbl compact"><thead><tr><th class="left">Account</th><th class="num">% Port</th><th class="num">Value</th><th class="num">Today</th></tr></thead><tbody>
    ${g.map(([k, x]) => `<tr><td><b>${esc(k)}</b><span class="muted small block">${x.rows.length} asset${x.rows.length > 1 ? 's' : ''}</span></td><td class="num muted">${pct(t.value ? (x.t.value / t.value) * 100 : 0, 1, false)}</td><td class="num strong">${idr(x.t.value)}</td><td class="num ${tone(x.t.day)}">${x.t.day ? pct(x.t.dayPct, 2) : '–'}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function movers(): string {
  const list = rows.filter((r) => r.day !== 0).sort((a, b) => b.dayPct - a.dayPct);
  const max = Math.max(0.01, ...list.map((r) => Math.abs(r.dayPct)));
  const body = list.length ? list.map((r) => {
    const w = (Math.abs(r.dayPct) / max) * 50;
    return `<li><span class="mv-name">${esc(r.h.cls === 'idx' ? r.h.symbol.replace('.JK', '') : r.h.symbol || r.h.name)}</span>
      <span class="mv-track"><i class="${r.dayPct >= 0 ? 'up' : 'down'}" style="width:${w}%;${r.dayPct >= 0 ? 'left:50%' : 'right:50%'}"></i></span>
      <span class="mv-val ${tone(r.dayPct)}">${pct(r.dayPct, 2)}</span></li>`;
  }).join('') : '<li class="muted">No price moves yet today.</li>';
  return `<div class="card-h"><h2>${icon('movers', 'accent')} Today's movers</h2></div><ul class="movers">${body}</ul>`;
}

// ---------------------------------------------------------------- charts

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawCharts(): void {
  const nw = document.getElementById('nw-chart');
  if (nw) {
    let pts = db.history;
    let fmtX = (x: number) => new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (ui.range === '1d') {
      pts = db.intraday.pts;
      fmtX = (x: number) => new Date(x).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (ui.range !== 'all') {
      const days = { '1m': 31, '3m': 92, '1y': 366 }[ui.range];
      const from = Date.now() - days * 86_400_000;
      pts = pts.filter((p) => p.t >= from);
    }
    lineChart(nw, [
      { name: 'Net worth', color: cssVar('--series-1'), points: pts.map((p) => ({ x: p.t, y: p.v })), area: true },
      { name: 'Cost basis', color: cssVar('--muted'), points: pts.map((p) => ({ x: p.t, y: p.c })), dashed: true },
    ], { fmtX, fmtY: (y) => short(y), fmtTip: (y) => idr(y), height: 280 });
  }
  const dc = document.getElementById('daily-chart');
  if (dc) {
    const h = db.history.slice(-31);
    const bars: Bar[] = [];
    for (let i = 1; i < h.length; i++) {
      // Change in (value − cost) strips out money added or withdrawn.
      const v = h[i].v - h[i].c - (h[i - 1].v - h[i - 1].c);
      const d = new Date(h[i].t);
      bars.push({
        label: String(d.getDate()),
        value: v,
        tip: `<div class="tip-h">${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div class="tip-row">${v >= 0 ? '▲ Gain' : '▼ Loss'}<b>${idr(v, true)}</b></div><div class="tip-row muted">Net worth<b>${idr(h[i].v)}</b></div>`,
      });
    }
    barChart(dc, bars, { fmtY: (y) => short(y, true), height: 280 });
  }
}

// ---------------------------------------------------------------- events

function bind(): void {
  app.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const a = el.dataset.act;
    if (a === 'refresh') refresh(true);
    else if (a === 'privacy') { db.settings.privacy = !db.settings.privacy; persist(); }
    else if (a === 'settings') openSettings();
    else if (a === 'add') openEditor();
    else if (a === 'sample') { db.holdings = sample(); persist(); refresh(true); }
    else if (a === 'install' && installEvt) { installEvt.prompt(); installEvt = null; render(); }
  }));
  app.querySelectorAll<HTMLElement>('[data-range]').forEach((el) => el.addEventListener('click', () => { ui.range = el.dataset.range as Range; render(); }));
  app.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) => el.addEventListener('click', () => { ui.filter = el.dataset.filter as AssetClass | 'all'; render(); }));
  app.querySelectorAll<HTMLElement>('[data-sort]').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.sort as keyof typeof SORTS;
    if (ui.sort === k) ui.dir = -ui.dir; else { ui.sort = k; ui.dir = k === 'name' ? 1 : -1; }
    render();
  }));
  app.querySelectorAll<HTMLElement>('[data-toggle]').forEach((el) => el.addEventListener('click', () => {
    const k = el.dataset.toggle!;
    if (ui.open.has(k)) ui.open.delete(k); else ui.open.add(k);
    render();
  }));
  app.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => el.addEventListener('click', () => {
    const h = db.holdings.find((x) => x.id === el.dataset.edit);
    if (h) openEditor(h);
  }));
}

// ---------------------------------------------------------------- modals

function modal(title: string, body: string, onMount: (root: HTMLElement, close: () => void) => void): void {
  hideTip();
  modalRoot.innerHTML = `<div class="backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="dialog-h"><h2>${esc(title)}</h2><button class="btn icon-btn" data-close title="Close">${icon('x')}</button></div>${body}</div></div>`;
  const root = modalRoot.firstElementChild as HTMLElement;
  const close = () => { modalRoot.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  root.querySelector('[data-close]')!.addEventListener('click', close);
  onMount(root, close);
}

interface FieldDef { k: string; label: string; type?: string; step?: string; ph?: string; hint?: string; req?: boolean; opts?: [string, string][] }

function fieldsFor(cls: AssetClass, currency = 'IDR'): FieldDef[] {
  const acct: FieldDef = { k: 'account', label: 'Account / where it is held', ph: 'Stockbit, Bibit, BCA, safe box…' };
  switch (cls) {
    case 'idx': return [
      { k: 'symbol', label: 'IDX ticker', ph: 'BBCA', req: true, hint: '“.JK” is added automatically' },
      { k: 'qty', label: 'Lots', type: 'number', step: '1', req: true, hint: '1 lot = 100 shares' },
      { k: 'avgCost', label: 'Average price per share (Rp)', type: 'number', step: 'any', req: true },
      { k: 'name', label: 'Name', ph: 'Filled from the ticker' }, acct,
      { k: 'manualPrice', label: 'Manual price per share (optional)', type: 'number', step: 'any', hint: 'Leave empty to use the live price' },
    ];
    case 'us': return [
      { k: 'symbol', label: 'US ticker', ph: 'AAPL', req: true },
      { k: 'qty', label: 'Shares', type: 'number', step: 'any', req: true, hint: 'Fractional shares are fine' },
      { k: 'avgCost', label: 'Average price per share (USD)', type: 'number', step: 'any', req: true },
      { k: 'name', label: 'Name', ph: 'Filled from the ticker' }, acct,
      { k: 'manualPrice', label: 'Manual price in USD (optional)', type: 'number', step: 'any' },
    ];
    case 'bond': return [
      { k: 'symbol', label: 'Series', ph: 'FR0100, ORI025, SR020, ST012…', req: true },
      { k: 'qty', label: 'Face value (Rp)', type: 'number', step: 'any', req: true },
      { k: 'avgCost', label: 'Buy price (% of par)', type: 'number', step: 'any', ph: '100' },
      { k: 'manualPrice', label: 'Current price (% of par)', type: 'number', step: 'any', ph: '100', hint: 'Retail SBN (ORI/SR/ST/SBR) stay at 100. For FR series, enter the price your app shows.' },
      { k: 'coupon', label: 'Coupon (% per year)', type: 'number', step: 'any' },
      { k: 'maturity', label: 'Maturity', type: 'date' }, acct,
    ];
    case 'gold': case 'silver': return [
      { k: 'name', label: 'Name', ph: cls === 'gold' ? 'Antam, UBS, Galeri24, Pegadaian digital…' : 'Silver bars', req: true },
      { k: 'qty', label: 'Grams', type: 'number', step: 'any', req: true },
      { k: 'avgCost', label: 'Average cost per gram (Rp)', type: 'number', step: 'any', req: true },
      acct,
      { k: 'manualPrice', label: 'Manual price per gram (optional)', type: 'number', step: 'any', hint: `Leave empty to follow the live spot price (adjustable in Settings)` },
    ];
    case 'cash': return [
      { k: 'name', label: 'Name', ph: 'BCA savings, e-wallet, deposito…', req: true },
      { k: 'currency', label: 'Currency', opts: [['IDR', 'IDR'], ['USD', 'USD']] },
      { k: 'qty', label: 'Amount', type: 'number', step: 'any', req: true },
      ...(currency === 'USD' ? [{ k: 'avgCost', label: 'Rate you bought at (Rp per USD, optional)', type: 'number', step: 'any', hint: 'Used to show your FX gain/loss' }] : []),
      acct,
    ];
  }
}

function openEditor(h?: Holding): void {
  let cls: AssetClass = h?.cls ?? 'idx';
  const draft: Record<string, string> = {};
  if (h) for (const [k, v] of Object.entries(h)) draft[k] = v == null ? '' : String(v);
  if (h?.cls === 'idx') draft.symbol = h.symbol.replace(/\.JK$/, '');

  const body = () => `<form class="form" novalidate>
    <div class="seg wide">${CLASSES.map((c) => `<button type="button" data-cls="${c.id}" class="${c.id === cls ? 'on' : ''}" ${h ? 'disabled' : ''}>${c.label}</button>`).join('')}</div>
    <div class="grid">${fieldsFor(cls, draft.currency).map((f) => `<label class="${f.k === 'manualPrice' || f.k === 'avgCost' && cls === 'cash' ? 'full' : ''}"><span>${f.label}${f.req ? ' *' : ''}</span>
      ${f.opts ? `<select name="${f.k}">${f.opts.map(([v, l]) => `<option value="${v}" ${draft[f.k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`
        : `<input name="${f.k}" type="${f.type ?? 'text'}" ${f.step ? `step="${f.step}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''} placeholder="${esc(f.ph ?? '')}" value="${esc(draft[f.k] ?? '')}" ${f.k === 'symbol' ? 'autocapitalize="characters" autocomplete="off"' : ''}>`}
      ${f.hint ? `<small>${f.hint}</small>` : ''}</label>`).join('')}</div>
    ${cls === 'idx' || cls === 'us' ? '<div class="check"><button type="button" class="btn" data-check>Check live price</button><span id="check-out" class="muted small"></span></div>' : ''}
    <div class="preview" id="preview"></div>
    <p class="err" id="err"></p>
    <div class="dialog-f">${h ? `<button type="button" class="btn danger" data-del>Delete</button>` : '<span></span>'}<button type="submit" class="btn primary">${h ? 'Save' : 'Add holding'}</button></div>
  </form>`;

  modal(h ? `Edit ${h.name}` : 'Add holding', '<div id="ed"></div>', (root, close) => {
    const host = root.querySelector('#ed') as HTMLElement;
    const capture = () => host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach((i) => { draft[i.name] = i.value; });
    const mount = () => {
      host.innerHTML = body();
      const form = host.querySelector('form')!;
      host.querySelectorAll<HTMLElement>('[data-cls]').forEach((b) => b.addEventListener('click', () => { capture(); cls = b.dataset.cls as AssetClass; mount(); }));
      form.addEventListener('input', () => { capture(); preview(); });
      form.querySelector('select[name="currency"]')?.addEventListener('change', () => { capture(); mount(); });
      host.querySelector('[data-check]')?.addEventListener('click', check);
      host.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!h || !confirm(`Delete ${h.name}?`)) return;
        db.holdings = db.holdings.filter((x) => x.id !== h.id);
        close(); persist();
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); capture(); submit(); });
      preview();
      (form.querySelector('input') as HTMLInputElement | null)?.focus();
    };
    const build = (): Holding | string => {
      const n = (k: string) => (draft[k] ?? '').trim() === '' ? undefined : Number(draft[k]);
      const qty = n('qty');
      if (qty == null || !isFinite(qty) || qty <= 0) return 'Enter a quantity above zero.';
      const out: Holding = { id: h?.id ?? uid(), cls, name: (draft.name ?? '').trim(), symbol: '', qty, avgCost: n('avgCost') ?? 0, account: (draft.account ?? '').trim() || undefined };
      if (cls === 'idx' || cls === 'us') {
        if (!draft.symbol?.trim()) return 'Enter a ticker.';
        out.symbol = normalizeSymbol(cls, draft.symbol);
        if (!out.name) out.name = draft._fetchedName || out.symbol.replace('.JK', '');
        if (!out.avgCost) return 'Enter your average price.';
      }
      if (cls === 'bond') {
        if (!draft.symbol?.trim()) return 'Enter the bond series.';
        out.symbol = draft.symbol.trim().toUpperCase();
        out.name = out.name || out.symbol;
        out.avgCost = out.avgCost || 100;
        out.coupon = n('coupon');
        out.maturity = draft.maturity || undefined;
      }
      if (cls === 'cash') {
        out.currency = (draft.currency as 'IDR' | 'USD') || 'IDR';
        if (out.currency === 'IDR') out.avgCost = 0;
      }
      if (!out.name) return 'Enter a name.';
      const mp = n('manualPrice');
      if (mp != null && cls !== 'cash') out.manualPrice = mp;
      return out;
    };
    const preview = () => {
      const el = host.querySelector('#preview') as HTMLElement;
      const b = build();
      if (typeof b === 'string') { el.innerHTML = ''; return; }
      const v = value(b, db.quotes, db.settings, fresh);
      el.innerHTML = `<span class="muted">Value now</span><b>${idr(v.value)}</b><span class="${tone(v.pl)}">${idr(v.pl, true)} (${pct(v.plPct, 1)})</span>`;
    };
    const check = async () => {
      capture();
      const out = host.querySelector('#check-out') as HTMLElement;
      if (!draft.symbol?.trim()) { out.textContent = 'Enter a ticker first.'; return; }
      const sym = normalizeSymbol(cls as 'idx' | 'us', draft.symbol);
      out.textContent = 'Checking…';
      try {
        const q = await yahooQuote(sym, db.settings.proxyBase);
        db.quotes[sym] = q;
        fresh.add(sym);
        draft._fetchedName = q.name ?? '';
        const nameInput = host.querySelector<HTMLInputElement>('input[name="name"]');
        if (nameInput && !nameInput.value && q.name) { nameInput.value = q.name; draft.name = q.name; }
        const c = ((q.price - q.prev) / q.prev) * 100;
        out.innerHTML = `<b>${esc(q.name ?? sym)}</b> · ${fmtPrice(q.price, q.currency)} <span class="${tone(c)}">${pct(c, 2)}</span>`;
        preview();
      } catch (e) {
        out.innerHTML = `<span class="neg">Not found or no connection (${esc(e instanceof Error ? e.message : String(e))}).</span>`;
      }
    };
    const submit = () => {
      const b = build();
      const err = host.querySelector('#err') as HTMLElement;
      if (typeof b === 'string') { err.textContent = b; return; }
      const i = db.holdings.findIndex((x) => x.id === b.id);
      if (i >= 0) db.holdings[i] = b; else db.holdings.push(b);
      close(); persist();
      if ((b.cls === 'idx' || b.cls === 'us') && !fresh.has(b.symbol)) refresh(true);
    };
    mount();
  });
}

function openSettings(): void {
  const s = db.settings;
  const body = `<form class="form" novalidate><div class="grid">
    <label class="full"><span>Net worth goal (Rp)</span><input name="goal" type="number" inputmode="numeric" value="${s.goal}"><small>Shown as the progress bar on the Net worth card. 0 hides it.</small></label>
    <label><span>Auto refresh</span><select name="refreshSec">${[[15, 'Every 15 s'], [30, 'Every 30 s'], [60, 'Every minute'], [300, 'Every 5 min'], [0, 'Off']].map(([v, l]) => `<option value="${v}" ${s.refreshSec === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label><span>Theme</span><select name="theme">${['auto', 'light', 'dark'].map((v) => `<option ${s.theme === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label><span>Gold price adjustment (%)</span><input name="goldAdjPct" type="number" step="any" value="${s.goldAdjPct}"><small>e.g. +8 for Antam retail, −3 for buyback</small></label>
    <label><span>Silver price adjustment (%)</span><input name="silverAdjPct" type="number" step="any" value="${s.silverAdjPct}"></label>
    <label class="full"><span>Price proxy URL (optional)</span><input name="proxyBase" type="url" placeholder="https://portofolio-prices.yourname.workers.dev" value="${esc(s.proxyBase)}">
      <small>Yahoo Finance blocks direct browser requests. <code>npm run dev</code> proxies them for you; for a deployed app, deploy <code>worker/yahoo-proxy.js</code> (free Cloudflare Worker) and paste its URL. Without one, public CORS proxies are tried.</small></label>
  </div>
  <div class="check"><button type="button" class="btn" data-test>Test connection</button><span id="test-out" class="muted small"></span></div>
  <h3 class="sect">Data</h3>
  <div class="row-btns">
    <button type="button" class="btn" data-export>Export backup</button>
    <label class="btn file">Import backup<input type="file" accept="application/json" data-import hidden></label>
    <button type="button" class="btn" data-sample>Replace with sample</button>
    <button type="button" class="btn danger" data-clear>Delete everything</button>
  </div>
  <div class="dialog-f"><span></span><button type="submit" class="btn primary">Save</button></div></form>`;
  modal('Settings', body, (root, close) => {
    const form = root.querySelector('form')!;
    const val = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).value;
    root.querySelector('[data-test]')!.addEventListener('click', async () => {
      const out = root.querySelector('#test-out')!;
      out.textContent = 'Testing…';
      try {
        const q = await yahooQuote('BBCA.JK', val('proxyBase'));
        out.innerHTML = `<span class="pos">Working</span> · BBCA ${fmtPrice(q.price, 'IDR')}`;
      } catch (e) {
        out.innerHTML = `<span class="neg">Failed: ${esc(e instanceof Error ? e.message : String(e))}</span>`;
      }
    });
    root.querySelector('[data-export]')!.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `portofolio-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    root.querySelector<HTMLInputElement>('[data-import]')!.addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        db = normalize(JSON.parse(await f.text()));
        close(); persist(); refresh(true);
      } catch { alert('That file is not a valid backup.'); }
    });
    root.querySelector('[data-sample]')!.addEventListener('click', () => {
      if (db.holdings.length && !confirm('Replace your holdings with the sample portfolio?')) return;
      db.holdings = sample(); close(); persist(); refresh(true);
    });
    root.querySelector('[data-clear]')!.addEventListener('click', () => {
      if (!confirm('Delete all holdings, history and settings on this device?')) return;
      db = emptyDB(); close(); persist();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = (k: string, d: number) => { const x = Number(val(k)); return isFinite(x) ? x : d; };
      const proxyChanged = val('proxyBase').trim() !== s.proxyBase;
      db.settings = { ...s, goal: Math.max(0, n('goal', s.goal)), refreshSec: n('refreshSec', 30), theme: val('theme') as typeof s.theme, goldAdjPct: n('goldAdjPct', 0), silverAdjPct: n('silverAdjPct', 0), proxyBase: val('proxyBase').trim() };
      close(); persist();
      if (proxyChanged) refresh(true);
    });
  });
}

function applyTheme(): void {
  const t = db.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ---------------------------------------------------------------- boot

revalue();
render();
refresh();

setInterval(() => {
  renderStatus();
  const every = db.settings.refreshSec * 1000;
  if (every && !fetching && document.visibilityState === 'visible' && Date.now() - lastFetch >= every) refresh();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 10_000) refresh();
});
window.addEventListener('online', () => refresh());
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = window.setTimeout(drawCharts, 150); });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e as typeof installEvt; render(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Exposed for quick debugging from the console.
Object.assign(window, { portofolio: { get db() { return db; }, refresh, LOT } });
