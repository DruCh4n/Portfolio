# Portofolio: live net-worth tracker (PWA)

An installable web app that values everything you own at live prices:

| Asset | You enter | Live price source |
| --- | --- | --- |
| Indonesian stocks | ticker (`BBCA`), **lots**, avg price/share | Yahoo Finance `BBCA.JK` (IDX quotes are delayed about 10 min) |
| US stocks / ETFs | ticker (`AAPL`), shares (fractional OK), avg price in USD | Yahoo Finance, converted at live USD/IDR |
| Indonesian bonds | series (`FR0100`, `ORI025`), face value, buy price %, coupon | Manual price % of par. Retail SBN stays at 100 |
| Gold / Silver | grams, avg cost per gram | COMEX `GC=F` / `SI=F` × USD/IDR ÷ 31.1035 g, plus an optional ± % (Antam premium or buyback) |
| Cash | IDR or USD amount | USD is converted at live USD/IDR |

So **1 lot BBCA** = 100 × the current BBCA price, and **5 g gold** = 5 × the current gold price per gram,
updated every 15 s to 5 min while the app is open.

Features include a dashboard, net-worth history, daily gain and loss excluding deposits, allocation by asset
class and by account, today's movers, a goal progress bar, a privacy mode, light and dark themes, an offline
app shell, and JSON export and import. All data stays in your browser's `localStorage`.

## Run it

```bash
cd portfolio
npm install
npm run dev        # http://localhost:5174, also reachable from your phone on the same Wi-Fi (--host)
npm test           # valuation maths checks
npm run build      # static files in dist/
```

## Why there's a proxy

Yahoo Finance doesn't allow direct browser requests (no CORS headers). The app tries these routes in order:

1. **Your proxy URL** (Settings → Price proxy URL).
2. **`/yahoo/*`**, which `npm run dev` and `npm run preview` forward for you.
3. Public CORS proxies (`corsproxy.io`, `allorigins`). These are convenient but rate-limited and not guaranteed.

Gold, silver and USD/IDR also fall back to `gold-api.com` and `open.er-api.com`, which work without a proxy.

**For a deployed app on your phone**, deploy the free Cloudflare Worker in [`worker/yahoo-proxy.js`](worker/yahoo-proxy.js)
(the steps are in the file header). Then paste its URL into Settings and press **Test connection**.

## Deploy and install

`npm run build` produces static files in `dist/`. Host them anywhere over HTTPS (GitHub Pages, Netlify,
Cloudflare Pages, Vercel). Open the site on your phone, then:
- Android/Chrome: tap **Install** in the header (or ⋮ → Install app).
- iPhone/Safari: tap Share → **Add to Home Screen**.

## Notes

- Market-open dots use regular session hours and ignore public holidays.
- US stock P/L uses today's exchange rate for the cost too, so it shows the stock's performance. Today's change includes the FX move.
- History builds up from the moments the app is open. One point is kept per day, plus intraday points for today.
