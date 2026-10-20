/**
 * Free Cloudflare Worker that forwards Yahoo Finance requests and adds CORS headers,
 * so the deployed Portofolio PWA can read live prices from any device.
 *
 * Deploy: dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker →
 * Edit code → paste this file → Deploy. Then paste the worker URL
 * (https://<name>.<you>.workers.dev) into Portofolio → Settings → Price proxy URL.
 *
 * Only the chart endpoint is forwarded, so the worker cannot be abused as an open proxy.
 */
const UPSTREAM = 'https://query1.finance.yahoo.com';
const ALLOWED = /^\/v8\/finance\/chart\/[^/]+$/;

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'GET' || !ALLOWED.test(url.pathname)) {
      return new Response('Not found', { status: 404, headers: cors });
    }
    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { 'User-Agent': 'Mozilla/5.0 (portofolio-proxy)', Accept: 'application/json' },
      cf: { cacheTtl: 10, cacheEverything: true },
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json');
    headers.set('Cache-Control', 'public, max-age=10');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
