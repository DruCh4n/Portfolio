let hidden = false;
export function setPrivacy(on: boolean): void { hidden = on; }

const grp = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Rp 6,598,479,425 */
export function idr(v: number, signed = false): string {
  if (hidden) return 'Rp •••••';
  const s = v < 0 ? '-' : signed && v > 0 ? '+' : '';
  return `${s}Rp ${grp(Math.abs(Math.round(v)))}`;
}

/** 6.60 Bio · 347.3 Mio · 12.5 K */
export function short(v: number, signed = false): string {
  if (hidden) return '•••';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : signed && v > 0 ? '+' : '';
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)} T`;
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)} Bio`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)} Mio`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)} K`;
  return `${s}${grp(a)}`;
}

export function pct(v: number, d = 1, signed = true): string {
  if (!isFinite(v)) return '–';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${v.toFixed(d)}%`;
}

/** Plain number, unaffected by privacy (prices are public). */
export function num(v: number, d = 0): string { return grp(v, d); }

export function price(v: number, currency: string): string {
  if (currency === 'USD') return `$${grp(v, 2)}`;
  return `Rp ${grp(v, v < 100 ? 2 : 0)}`;
}

export function qty(v: number, d = 4): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: d });
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
