import { FX, GOLD, SILVER } from './prices';
import type { AssetClass, Holding, QuoteMap, Settings } from './types';

export const OZ_GRAMS = 31.1034768;
export const LOT = 100;

export const CLASSES: { id: AssetClass; label: string; unit: string }[] = [
  { id: 'idx', label: 'Indonesian stocks', unit: 'lot' },
  { id: 'us', label: 'US stocks', unit: 'sh' },
  { id: 'bond', label: 'Indonesian bonds', unit: 'Rp face' },
  { id: 'gold', label: 'Gold', unit: 'g' },
  { id: 'silver', label: 'Silver', unit: 'g' },
  { id: 'cash', label: 'Cash', unit: '' },
];
export const classLabel = (c: AssetClass) => CLASSES.find((x) => x.id === c)!.label;

export interface Valued {
  h: Holding;
  /** Current unit price in its native currency (share, gram, % of par, IDR per USD). */
  price: number;
  prev: number;
  currency: string;
  value: number; // IDR
  cost: number; // IDR
  day: number; // IDR change vs previous close
  dayPct: number;
  pl: number;
  plPct: number;
  /** Bond coupon per year, IDR (before tax). */
  income: number;
  live: boolean;
  /** Price came from a cached quote or is missing entirely. */
  stale: boolean;
  time?: number;
  spark?: number[];
}

/** Every Yahoo symbol needed to value these holdings. */
export function symbolsFor(holdings: Holding[]): string[] {
  const s = new Set<string>([FX]);
  for (const h of holdings) {
    if ((h.cls === 'idx' || h.cls === 'us') && h.symbol && h.manualPrice == null) s.add(h.symbol);
    if (h.cls === 'gold') s.add(GOLD);
    if (h.cls === 'silver') s.add(SILVER);
  }
  return [...s];
}

/** IDR per gram for a metal quote, with the user's premium/discount applied. */
export function perGram(usdOz: number, idrPerUsd: number, adjPct: number): number {
  return (usdOz * idrPerUsd) / OZ_GRAMS * (1 + adjPct / 100);
}

export function value(h: Holding, q: QuoteMap, s: Settings, fresh: Set<string>): Valued {
  const fx = q[FX];
  const fxNow = fx?.price ?? 16_000;
  const fxPrev = fx?.prev ?? fxNow;
  let price = 0, prev = 0, currency = 'IDR', val = 0, prevVal = 0, cost = 0, income = 0;
  let live = false, stale = false, time: number | undefined, spark: number[] | undefined;
  const useQuote = (sym: string) => {
    const x = q[sym];
    if (!x) { stale = true; return undefined; }
    live = true; stale = !fresh.has(sym); time = x.time; spark = x.spark;
    return x;
  };

  switch (h.cls) {
    case 'idx':
    case 'us': {
      const units = h.cls === 'idx' ? h.qty * LOT : h.qty;
      const toIdr = h.cls === 'us' ? fxNow : 1;
      const toIdrPrev = h.cls === 'us' ? fxPrev : 1;
      currency = h.cls === 'us' ? 'USD' : 'IDR';
      if (h.manualPrice != null) { price = prev = h.manualPrice; }
      else {
        const x = useQuote(h.symbol);
        price = x?.price ?? h.avgCost;
        prev = x?.prev ?? price;
      }
      val = units * price * toIdr;
      prevVal = units * prev * toIdrPrev;
      cost = units * h.avgCost * toIdr;
      if (h.cls === 'us') stale ||= !fresh.has(FX) && h.manualPrice == null;
      break;
    }
    case 'gold':
    case 'silver': {
      const adj = h.cls === 'gold' ? s.goldAdjPct : s.silverAdjPct;
      if (h.manualPrice != null) { price = prev = h.manualPrice; }
      else {
        const x = useQuote(h.cls === 'gold' ? GOLD : SILVER);
        price = x ? perGram(x.price, fxNow, adj) : h.avgCost;
        prev = x ? perGram(x.prev, fxPrev, adj) : price;
      }
      val = h.qty * price;
      prevVal = h.qty * prev;
      cost = h.qty * h.avgCost;
      break;
    }
    case 'bond': {
      price = prev = h.manualPrice ?? 100;
      currency = '%';
      val = prevVal = (h.qty * price) / 100;
      cost = (h.qty * (h.avgCost || 100)) / 100;
      income = (h.qty * (h.coupon ?? 0)) / 100;
      break;
    }
    case 'cash': {
      if (h.currency === 'USD') {
        const x = useQuote(FX);
        price = x?.price ?? fxNow;
        prev = x?.prev ?? price;
        val = h.qty * price;
        prevVal = h.qty * prev;
        cost = h.avgCost > 0 ? h.qty * h.avgCost : val;
        currency = 'IDR';
      } else {
        price = prev = 1;
        val = prevVal = cost = h.qty;
      }
      break;
    }
  }
  const day = val - prevVal;
  return {
    h, price, prev, currency, value: val, cost, day,
    dayPct: prevVal ? (day / prevVal) * 100 : 0,
    pl: val - cost,
    plPct: cost ? ((val - cost) / cost) * 100 : 0,
    income, live, stale, time, spark,
  };
}

export interface Totals { value: number; cost: number; day: number; dayPct: number; pl: number; plPct: number; income: number }

export function totals(rows: Valued[]): Totals {
  const value = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  const day = rows.reduce((a, r) => a + r.day, 0);
  const income = rows.reduce((a, r) => a + r.income, 0);
  const prev = value - day;
  return { value, cost, day, dayPct: prev ? (day / prev) * 100 : 0, pl: value - cost, plPct: cost ? ((value - cost) / cost) * 100 : 0, income };
}

export function groupBy<K extends string>(rows: Valued[], key: (r: Valued) => K): Map<K, { rows: Valued[]; t: Totals }> {
  const m = new Map<K, Valued[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  const out = new Map<K, { rows: Valued[]; t: Totals }>();
  for (const [k, rs] of m) out.set(k, { rows: rs, t: totals(rs) });
  return out;
}
