import { defineConfig, type ProxyOptions } from 'vite';

// Yahoo Finance does not send CORS headers, so the dev/preview server forwards /yahoo/* to it.
// A deployed build uses the Cloudflare Worker in worker/ (set its URL in Settings) or public CORS proxies.
const yahoo: Record<string, ProxyOptions> = {
  '/yahoo': {
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/yahoo/, ''),
    headers: { 'User-Agent': 'Mozilla/5.0 (portofolio-tracker)' },
  },
};

export default defineConfig({
  base: './',
  server: { port: 5174, proxy: yahoo },
  preview: { port: 4174, proxy: yahoo },
  build: { target: 'es2022' },
});
