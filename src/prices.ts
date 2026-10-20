import type { Quote, QuoteMap } from './types';

/** Symbols every valuation needs besides the holdings themselves. */
export const FX = 'IDR=X'; // IDR per 1 USD
export const GOLD = 'GC=F'; // USD per troy ounce (COMEX)
export const SILVER = 'SI=F';
export const MARKETS = ['^JKSE', '^GSPC'];

const YAHOO = 'https://query1.finance.yahoo.com';
const TIMEOUT = 9000;

/**
 * Yahoo has no CORS headers, so a browser has to go through something that adds them.
 * Routes are tried in order; the one that last worked is tried first next time.
 */
function routes(path: string, proxyBase: string): string[] {
  const full = YAHOO + path;
  const out: string[] = [];
  if (proxyBase.trim()) out.push(proxyBase.trim().replace(/\/+$/, '') + path);
  out.push('/yahoo' + path); // vite dev / preview proxy
  out.push('https://corsproxy.io/?url=' + encodeURIComponent(full));
  out.push('https://api.allorigins.win/raw?url=' + encodeURIComponent(full));
  return out;
}

let preferred = 0;

async function getJSON(url: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function yahoo(path: string, proxyBase: string): Promise<unknown> {
  const list = routes(path, proxyBase);
  const order = [preferred, ...list.map((_, i) => i).filter((i) => i !== preferred)].filter((i) => i < list.length);
  let err: unknown;
  for (const i of order) {
    try {
      const j = await getJSON(list[i]);
      preferred = i;
      return j;
    } catch (e) {
      err = e;
    }
  }
  throw err ?? new Error('no route');
}

interface ChartMeta {
  currency?: string;
  symbol?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number;
  shortName?: string;
  longName?: string;
}
interface ChartJSON {
  chart?: {
    result?: { meta: ChartMeta; indicators?: { quote?: { close?: (number | null)[] }[] } }[] | null;
    error?: { description?: string } | null;
  };
}

/** One quote from Yahoo's chart endpoint (works without a crumb/cookie). */
export async function yahooQuote(symbol: string, proxyBase: string): Promise<Quote> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`;
  const j = (await yahoo(path, proxyBase)) as ChartJSON;
  const r = j.chart?.result?.[0];
  if (!r) throw new Error(j.chart?.error?.description ?? `Unknown symbol ${symbol}`);
  const m = r.meta;
  if (typeof m.regularMarketPrice !== 'number') throw new Error(`No price for ${symbol}`);
  const closes = (r.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => typeof v === 'number');
  return {
    symbol,
    price: m.regularMarketPrice,
    prev: m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice,
    currency: m.currency ?? '',
    time: (m.regularMarketTime ?? Date.now() / 1000) * 1000,
    name: m.longName ?? m.shortName,
    spark: closes.length > 1 ? closes : undefined,
    source: 'Yahoo',
  };
}

/** CORS-friendly fallbacks for metals and USD/IDR when Yahoo is unreachable. */
async function fallback(symbol: string): Promise<Quote> {
  if (symbol === GOLD || symbol === SILVER) {
    const code = symbol === GOLD ? 'XAU' : 'XAG';
    const j = (await getJSON(`https://api.gold-api.com/price/${code}`)) as { price?: number; updatedAt?: string };
    if (typeof j.price !== 'number') throw new Error('gold-api: no price');
    return { symbol, price: j.price, prev: j.price, currency: 'USD', time: j.updatedAt ? Date.parse(j.updatedAt) : Date.now(), source: 'gold-api.com' };
  }
  if (symbol === FX) {
    const j = (await getJSON('https://open.er-api.com/v6/latest/USD')) as { rates?: Record<string, number>; time_last_update_unix?: number };
    const r = j.rates?.IDR;
    if (typeof r !== 'number') throw new Error('er-api: no IDR');
    return { symbol, price: r, prev: r, currency: 'IDR', time: (j.time_last_update_unix ?? Date.now() / 1000) * 1000, source: 'open.er-api.com' };
  }
  throw new Error('no fallback');
}

export interface FetchResult { quotes: QuoteMap; errors: Record<string, string> }

/** Fetch many symbols with limited concurrency. Failed symbols are reported, not thrown. */
export async function fetchQuotes(symbols: string[], proxyBase: string): Promise<FetchResult> {
  const quotes: QuoteMap = {};
  const errors: Record<string, string> = {};
  const queue = [...new Set(symbols.filter(Boolean))];
  const worker = async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) {
      try {
        quotes[s] = await yahooQuote(s, proxyBase);
      } catch (e) {
        try {
          quotes[s] = await fallback(s);
        } catch {
          errors[s] = e instanceof Error ? e.message : String(e);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return { quotes, errors };
}

/** IDX tickers are typed as "BBCA" but Yahoo wants "BBCA.JK". */
export function normalizeSymbol(cls: 'idx' | 'us', raw: string): string {
  const s = raw.trim().toUpperCase();
  if (cls === 'idx') return s.endsWith('.JK') ? s : `${s}.JK`;
  return s;
}

/** Rough session check (ignores public holidays). */
export function marketOpen(market: 'idx' | 'us', now = new Date()): boolean {
  const tz = market === 'idx' ? 'Asia/Jakarta' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = get('weekday');
  if (wd === 'Sat' || wd === 'Sun') return false;
  const m = Number(get('hour')) * 60 + Number(get('minute'));
  if (market === 'us') return m >= 9 * 60 + 30 && m < 16 * 60;
  // IDX: session 1 09:00–12:00 (Fri 11:30), session 2 13:30 (Fri 14:00)–15:50, closing auction to 16:00.
  const s1End = wd === 'Fri' ? 11 * 60 + 30 : 12 * 60;
  const s2Start = wd === 'Fri' ? 14 * 60 : 13 * 60 + 30;
  return (m >= 9 * 60 && m < s1End) || (m >= s2Start && m < 16 * 60);
}
