export type AssetClass = 'idx' | 'us' | 'bond' | 'gold' | 'silver' | 'cash';

export interface Holding {
  id: string;
  cls: AssetClass;
  /** Display name, e.g. "Bank Central Asia" or "Antam 10 g". */
  name: string;
  /** Yahoo symbol for idx/us (BBCA.JK, AAPL); series code for bonds (FR0100). */
  symbol: string;
  /**
   * idx: lots (1 lot = 100 shares) · us: shares · gold/silver: grams
   * bond: face value in IDR · cash: amount in `currency`
   */
  qty: number;
  /**
   * idx: IDR per share · us: USD per share · gold/silver: IDR per gram
   * bond: buy price as % of par · cash (USD only): IDR per USD when bought
   */
  avgCost: number;
  /** Cash only. */
  currency?: 'IDR' | 'USD';
  /** Overrides the live price (same unit as avgCost). Bonds use it as the market price % of par. */
  manualPrice?: number;
  /** Bond coupon % per year. */
  coupon?: number;
  /** Bond maturity, YYYY-MM-DD. */
  maturity?: string;
  /** Where it is held: Stockbit, Ajaib, Pluang, BCA... */
  account?: string;
}

export interface Quote {
  symbol: string;
  price: number;
  /** Previous close; equals price when unknown. */
  prev: number;
  currency: string;
  /** Epoch ms of the last trade/update. */
  time: number;
  name?: string;
  /** Intraday closes for a sparkline. */
  spark?: number[];
  source: string;
}

export type QuoteMap = Record<string, Quote>;

export interface Settings {
  goal: number;
  refreshSec: number;
  /** Base URL that replaces https://query1.finance.yahoo.com (e.g. a Cloudflare Worker). */
  proxyBase: string;
  goldAdjPct: number;
  silverAdjPct: number;
  privacy: boolean;
  theme: 'auto' | 'light' | 'dark';
}

/** Portfolio value (v) and cost basis (c) at time t. */
export interface Snapshot { t: number; v: number; c: number }

export interface DB {
  holdings: Holding[];
  settings: Settings;
  /** One snapshot per calendar day (the last one taken that day). */
  history: Snapshot[];
  /** Today's snapshots, reset each day. */
  intraday: { date: string; pts: Snapshot[] };
  /** Last good quotes, so the app still shows values offline. */
  quotes: QuoteMap;
}
