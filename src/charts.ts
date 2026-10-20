/** Small dependency-free SVG charts with hover tooltips. */

export interface LinePoint { x: number; y: number }
export interface LineSeries { name: string; color: string; points: LinePoint[]; dashed?: boolean; area?: boolean }

const NS = 'http://www.w3.org/2000/svg';

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(v);
  return out;
}

function tooltip(): HTMLDivElement {
  let el = document.getElementById('viz-tip') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'viz-tip';
    el.className = 'viz-tip';
    document.body.appendChild(el);
  }
  return el;
}

function showTip(html: string, cx: number, cy: number): void {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = cx + 14, y = cy - h - 10;
  if (x + w > window.innerWidth - 8) x = cx - w - 14;
  if (y < 8) y = cy + 14;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${y}px`;
}
export function hideTip(): void { const t = document.getElementById('viz-tip'); if (t) t.style.display = 'none'; }

export function lineChart(
  host: HTMLElement,
  series: LineSeries[],
  o: { fmtX: (x: number) => string; fmtY: (y: number) => string; fmtTip: (y: number) => string; height?: number; xTicks?: number },
): void {
  host.innerHTML = '';
  const W = Math.max(280, host.clientWidth), H = o.height ?? 260;
  const pad = { l: 64, r: 12, t: 12, b: 28 };
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    host.innerHTML = '<div class="empty-chart">Not enough data yet — history builds up as prices refresh.</div>';
    return;
  }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  const yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = Math.min(yt[0], Math.min(...ys)), y1 = Math.max(yt[yt.length - 1], Math.max(...ys));
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('role', 'img');
  let g = '';
  for (const v of yt) {
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/>`;
    g += `<text x="${pad.l - 8}" y="${sy(v) + 4}" text-anchor="end" class="tick">${o.fmtY(v)}</text>`;
  }
  const nx = o.xTicks ?? Math.min(6, Math.floor((W - pad.l) / 90));
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    const anchor = i === 0 ? 'start' : i === nx ? 'end' : 'middle';
    g += `<text x="${sx(x)}" y="${H - 8}" text-anchor="${anchor}" class="tick">${o.fmtX(x)}</text>`;
  }
  g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="axis"/>`;
  for (const s of series) {
    if (s.points.length < 2) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (s.area) {
      const a = `${d}L${sx(s.points[s.points.length - 1].x)},${H - pad.b}L${sx(s.points[0].x)},${H - pad.b}Z`;
      g += `<path d="${a}" style="fill:${s.color}" opacity="0.10"/>`;
    }
    g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
    const last = s.points[s.points.length - 1];
    g += `<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="4" style="fill:${s.color}" class="ring"/>`;
  }
  g += `<g class="hover" style="display:none"><line class="cross" y1="${pad.t}" y2="${H - pad.b}"/>${series.map((s) => `<circle r="4.5" style="fill:${s.color}" class="ring"/>`).join('')}</g>`;
  g += `<rect x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent" class="hit"/>`;
  svg.innerHTML = g;
  host.appendChild(svg);

  const hover = svg.querySelector('.hover') as SVGGElement;
  const cross = hover.querySelector('line')!;
  const dots = hover.querySelectorAll('circle');
  const hit = svg.querySelector('.hit')!;
  const base = series[0].points;
  const move = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = base[0];
    for (const p of base) if (Math.abs(p.x - xv) < Math.abs(best.x - xv)) best = p;
    hover.style.display = '';
    cross.setAttribute('x1', String(sx(best.x)));
    cross.setAttribute('x2', String(sx(best.x)));
    let rows = '';
    series.forEach((s, i) => {
      const p = s.points.find((q) => q.x === best.x) ?? s.points.reduce((a, q) => (Math.abs(q.x - best.x) < Math.abs(a.x - best.x) ? q : a), s.points[0]);
      dots[i].setAttribute('cx', String(sx(p.x)));
      dots[i].setAttribute('cy', String(sy(p.y)));
      rows += `<div class="tip-row"><span class="sw" style="background:${s.color}"></span>${s.name}<b>${o.fmtTip(p.y)}</b></div>`;
    });
    showTip(`<div class="tip-h">${o.fmtX(best.x)}</div>${rows}`, ev.clientX, ev.clientY);
  };
  hit.addEventListener('pointermove', move as EventListener);
  hit.addEventListener('pointerdown', move as EventListener);
  hit.addEventListener('pointerleave', () => { hover.style.display = 'none'; hideTip(); });
}

export interface Bar { label: string; value: number; tip: string; forecast?: boolean }

/** Vertical bars around a zero baseline; positive = good colour, negative = critical colour. */
export function barChart(host: HTMLElement, bars: Bar[], o: { fmtY: (y: number) => string; height?: number }): void {
  host.innerHTML = '';
  if (!bars.length) {
    host.innerHTML = '<div class="empty-chart">Daily changes appear after the app has seen two different days.</div>';
    return;
  }
  const W = Math.max(280, host.clientWidth), H = o.height ?? 220;
  const pad = { l: 64, r: 8, t: 10, b: 24 };
  const vals = bars.map((b) => b.value);
  const yt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const y0 = Math.min(yt[0], ...vals, 0), y1 = Math.max(yt[yt.length - 1], ...vals, 0);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.max(3, Math.min(28, slot - 2));
  let g = '';
  for (const v of yt) {
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/>`;
    g += `<text x="${pad.l - 8}" y="${sy(v) + 4}" text-anchor="end" class="tick">${o.fmtY(v)}</text>`;
  }
  const every = Math.ceil(bars.length / Math.floor((W - pad.l) / 34));
  bars.forEach((b, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const top = sy(Math.max(0, b.value)), bot = sy(Math.min(0, b.value));
    const h = Math.max(1, bot - top);
    const cls = b.value >= 0 ? 'bar-up' : 'bar-down';
    const r = Math.min(4, bw / 2, h);
    // Round only the data end (away from the baseline).
    const x = cx - bw / 2;
    const d = b.value >= 0
      ? `M${x},${bot}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${bot}Z`
      : `M${x},${top}V${bot - r}Q${x},${bot} ${x + r},${bot}H${x + bw - r}Q${x + bw},${bot} ${x + bw},${bot - r}V${top}Z`;
    g += `<path d="${d}" class="${cls}"/>`;
    g += `<rect x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${H - pad.t - pad.b}" fill="transparent" class="hit" data-i="${i}"/>`;
    if (i % every === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="tick">${b.label}</text>`;
  });
  g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(0)}" y2="${sy(0)}" class="axis"/>`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.innerHTML = g;
  host.appendChild(svg);
  svg.querySelectorAll<SVGRectElement>('.hit').forEach((el) => {
    const b = bars[Number(el.dataset.i)];
    const show = (ev: PointerEvent) => showTip(b.tip, ev.clientX, ev.clientY);
    el.addEventListener('pointermove', show as EventListener);
    el.addEventListener('pointerdown', show as EventListener);
    el.addEventListener('pointerleave', hideTip);
  });
}

/** Tiny inline sparkline (no axes). */
export function sparkline(vals: number[], up: boolean, w = 72, h = 22): string {
  if (!vals || vals.length < 2) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / (mx - mn || 1)) * (h - 4)).toFixed(1)}`).join('');
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}"/></svg>`;
}
