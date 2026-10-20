import type { DB, Holding, Settings, Snapshot } from './types';

const KEY = 'portofolio.v1';

export const defaultSettings: Settings = {
  goal: 1_000_000_000,
  refreshSec: 30,
  proxyBase: '',
  goldAdjPct: 0,
  silverAdjPct: 0,
  privacy: false,
  theme: 'auto',
};

export function emptyDB(): DB {
  return { holdings: [], settings: { ...defaultSettings }, history: [], intraday: { date: today(), pts: [] }, quotes: {} };
}

export function today(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDB();
    return normalize(JSON.parse(raw));
  } catch {
    return emptyDB();
  }
}

export function normalize(x: Partial<DB>): DB {
  const db = emptyDB();
  if (Array.isArray(x.holdings)) db.holdings = x.holdings.filter((h) => h && typeof h.qty === 'number');
  db.settings = { ...defaultSettings, ...(x.settings ?? {}) };
  if (Array.isArray(x.history)) db.history = x.history;
  if (x.intraday && x.intraday.date === today()) db.intraday = x.intraday;
  if (x.quotes && typeof x.quotes === 'object') db.quotes = x.quotes;
  return db;
}

export function save(db: DB): void {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Record a valuation: today's intraday series plus the per-day history. */
export function record(db: DB, snap: Snapshot): void {
  const d = today(new Date(snap.t));
  if (db.intraday.date !== d) db.intraday = { date: d, pts: [] };
  const pts = db.intraday.pts;
  const last = pts[pts.length - 1];
  // Keep at most one point per minute and cap the day at ~600 points.
  if (last && snap.t - last.t < 60_000) pts[pts.length - 1] = snap;
  else pts.push(snap);
  if (pts.length > 600) pts.splice(0, pts.length - 600);

  const h = db.history;
  const lastDay = h[h.length - 1];
  if (lastDay && today(new Date(lastDay.t)) === d) h[h.length - 1] = snap;
  else h.push(snap);
  if (h.length > 3660) h.splice(0, h.length - 3660);
}

export function sample(): Holding[] {
  return [
    { id: uid(), cls: 'idx', name: 'Bank Central Asia', symbol: 'BBCA.JK', qty: 20, avgCost: 9200, account: 'Stockbit' },
    { id: uid(), cls: 'idx', name: 'Bank Rakyat Indonesia', symbol: 'BBRI.JK', qty: 30, avgCost: 4500, account: 'Stockbit' },
    { id: uid(), cls: 'idx', name: 'Telkom Indonesia', symbol: 'TLKM.JK', qty: 25, avgCost: 3100, account: 'Ajaib' },
    { id: uid(), cls: 'us', name: 'Apple', symbol: 'AAPL', qty: 3, avgCost: 190, account: 'Gotrade' },
    { id: uid(), cls: 'us', name: 'Vanguard S&P 500 ETF', symbol: 'VOO', qty: 1.5, avgCost: 480, account: 'Gotrade' },
    { id: uid(), cls: 'bond', name: 'ORI025', symbol: 'ORI025', qty: 10_000_000, avgCost: 100, coupon: 6.25, maturity: '2027-03-15', account: 'Bibit' },
    { id: uid(), cls: 'bond', name: 'FR0100', symbol: 'FR0100', qty: 5_000_000, avgCost: 98.5, manualPrice: 99.6, coupon: 6.625, maturity: '2034-02-15', account: 'Bibit' },
    { id: uid(), cls: 'gold', name: 'Antam bars', symbol: '', qty: 10, avgCost: 1_350_000, account: 'Safe box' },
    { id: uid(), cls: 'silver', name: 'Silver bars', symbol: '', qty: 100, avgCost: 15_000, account: 'Safe box' },
    { id: uid(), cls: 'cash', name: 'BCA savings', symbol: '', qty: 25_000_000, avgCost: 0, currency: 'IDR', account: 'BCA' },
    { id: uid(), cls: 'cash', name: 'USD cash', symbol: '', qty: 500, avgCost: 15_800, currency: 'USD', account: 'Jago' },
  ];
}
