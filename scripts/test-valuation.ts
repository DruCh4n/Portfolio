// Sanity checks for valuation maths: npm test
import assert from 'node:assert/strict';
import { FX, GOLD } from '../src/prices';
import { defaultSettings } from '../src/store';
import type { Holding, QuoteMap } from '../src/types';
import { OZ_GRAMS, totals, value } from '../src/valuation';

const q: QuoteMap = {
  [FX]: { symbol: FX, price: 16_000, prev: 15_800, currency: 'IDR', time: 0, source: 't' },
  [GOLD]: { symbol: GOLD, price: 2_500, prev: 2_450, currency: 'USD', time: 0, source: 't' },
  'BBCA.JK': { symbol: 'BBCA.JK', price: 10_000, prev: 9_800, currency: 'IDR', time: 0, source: 't' },
  AAPL: { symbol: 'AAPL', price: 200, prev: 190, currency: 'USD', time: 0, source: 't' },
};
const fresh = new Set(Object.keys(q));
const s = { ...defaultSettings };
const h = (x: Partial<Holding>): Holding => ({ id: 'x', cls: 'idx', name: 'x', symbol: '', qty: 1, avgCost: 0, ...x });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// 1 lot BBCA = 100 shares
let v = value(h({ cls: 'idx', symbol: 'BBCA.JK', qty: 1, avgCost: 9_000 }), q, s, fresh);
close(v.value, 1_000_000); close(v.cost, 900_000); close(v.day, 20_000);

// US stock: day change includes the FX move
v = value(h({ cls: 'us', symbol: 'AAPL', qty: 2, avgCost: 150 }), q, s, fresh);
close(v.value, 2 * 200 * 16_000); close(v.day, 2 * 200 * 16_000 - 2 * 190 * 15_800);

// 5 g of gold at spot
v = value(h({ cls: 'gold', qty: 5, avgCost: 1_000_000 }), q, s, fresh);
close(v.value, (5 * 2_500 * 16_000) / OZ_GRAMS);
v = value(h({ cls: 'gold', qty: 5, avgCost: 1_000_000 }), q, { ...s, goldAdjPct: 10 }, fresh);
close(v.value, ((5 * 2_500 * 16_000) / OZ_GRAMS) * 1.1);

// Bond: face × price %, coupon income
v = value(h({ cls: 'bond', qty: 10_000_000, avgCost: 98, manualPrice: 101, coupon: 6.5 }), q, s, fresh);
close(v.value, 10_100_000); close(v.cost, 9_800_000); close(v.income, 650_000); close(v.day, 0);

// Cash
v = value(h({ cls: 'cash', qty: 100, currency: 'USD', avgCost: 15_000 }), q, s, fresh);
close(v.value, 1_600_000); close(v.cost, 1_500_000); close(v.day, 20_000);
v = value(h({ cls: 'cash', qty: 5_000_000, currency: 'IDR' }), q, s, fresh);
close(v.value, 5_000_000); close(v.pl, 0);

// Manual price overrides live quote
v = value(h({ cls: 'idx', symbol: 'BBCA.JK', qty: 2, avgCost: 9_000, manualPrice: 9_500 }), q, s, fresh);
close(v.value, 1_900_000); close(v.day, 0);

// Missing quote falls back to cost and is marked stale
v = value(h({ cls: 'idx', symbol: 'XXXX.JK', qty: 1, avgCost: 500 }), q, s, fresh);
close(v.value, 50_000); assert.ok(v.stale);

const t = totals([value(h({ cls: 'idx', symbol: 'BBCA.JK', qty: 1, avgCost: 9_000 }), q, s, fresh), value(h({ cls: 'cash', qty: 1_000_000, currency: 'IDR' }), q, s, fresh)]);
close(t.value, 2_000_000); close(t.day, 20_000); close(t.dayPct, (20_000 / 1_980_000) * 100);

console.log('valuation: all checks passed');
