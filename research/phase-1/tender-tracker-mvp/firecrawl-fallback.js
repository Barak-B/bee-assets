// firecrawl-fallback.js — Phase 1.5
//
// Wraps Firecrawl skill for sources that block raw fetch (SPA, JS-heavy, Cloudflare).
// Detects from earlier failure patterns + per-source config flag.
//
// SOURCE: phase-1-final-status.md §Phase 1.5 #1 — Ashkelon SPA + Jerusalem Cloudflare
// MOTIVATION: Each blocked source = potential ₪500K+ tender missed.
//
// FALLBACK CHAIN per source:
//   1. raw fetch (current pollHtml)        → fastest, no cost
//   2. firecrawl scrape (this module)      → handles SPA + JS rendering
//   3. firecrawl crawl + LLM extract       → for index pages with embedded tenders
//   4. manual entry / skip                 → log to ops queue
//
// USAGE (called from gov-rss-poller.js):
//   import { fetchWithFirecrawlFallback } from './firecrawl-fallback.js';
//   const html = await fetchWithFirecrawlFallback(source, config);
//
// PREREQ: Firecrawl skill enabled in OpenClaw (✓ already enabled, 14 sub-skills).
//         Sets FIRECRAWL_API_KEY env var OR uses self-hosted firecrawl.

import fetch from "node-fetch";

const FIRECRAWL_API = process.env.FIRECRAWL_API_BASE || "https://api.firecrawl.dev/v1";
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;

/**
 * Determine whether a source requires Firecrawl based on:
 *  - explicit config flag `source.use_firecrawl = true`
 *  - URL heuristics (SPA frameworks, known-blocked patterns)
 *
 * @param {object} source
 * @returns {boolean}
 */
export function needsFirecrawl(source) {
  if (source.use_firecrawl === true) return true;
  if (source.use_firecrawl === false) return false; // explicit opt-out

  // Heuristics: known SPA / Cloudflare hosts
  const url = source.url || "";
  const spaPatterns = [
    /ashkelon\.muni\.il/i,    // confirmed SPA
    /jerusalem\.muni\.il/i,   // confirmed Cloudflare
    /\/\#\//,                  // hash-routed SPA
    /angular|react|vue/i,
  ];
  return spaPatterns.some((re) => re.test(url));
}

/**
 * Main entrypoint — fetches HTML using best available method.
 *
 * @param {object} source - from config.sources[]
 * @param {object} config
 * @returns {Promise<{html: string, method: 'raw'|'firecrawl-scrape'|'firecrawl-crawl', cost_usd?: number}>}
 */
export async function fetchWithFirecrawlFallback(source, config) {
  // Method 1: raw fetch unless we know it'll fail
  if (!needsFirecrawl(source)) {
    try {
      const res = await fetch(source.url, {
        headers: { "User-Agent": config.polling.user_agent },
        signal: AbortSignal.timeout(config.polling.timeout_ms),
      });
      if (res.ok) {
        const html = await res.text();
        if (html.length > 500) {
          // Sanity: a real page should have >500 chars
          return { html, method: "raw" };
        }
      }
    } catch {
      // fall through to firecrawl
    }
  }

  // Method 2: Firecrawl scrape (single page)
  if (!FIRECRAWL_KEY) {
    throw new Error(
      `Firecrawl needed for ${source.name} but FIRECRAWL_API_KEY not set. ` +
        `Set env var or add to config.`
    );
  }

  const scrapeResult = await firecrawlScrape(source.url, {
    formats: ["html", "markdown"],
    onlyMainContent: false, // tenders often in sidebar/footer
    waitFor: 3000, // give SPA time to render
  });

  return {
    html: scrapeResult.html || scrapeResult.markdown,
    method: "firecrawl-scrape",
    cost_usd: 0.003, // Firecrawl scrape ≈ $0.003/page
  };
}

/**
 * For index pages with many tenders linked — crawl + extract structured.
 *
 * @param {string} startUrl
 * @param {object} options
 * @returns {Promise<Array<{title, url, snippet}>>}
 */
export async function firecrawlCrawlForTenders(startUrl, options = {}) {
  if (!FIRECRAWL_KEY) throw new Error("FIRECRAWL_API_KEY missing");

  const res = await fetch(`${FIRECRAWL_API}/crawl`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: startUrl,
      maxDepth: options.maxDepth ?? 1,
      limit: options.limit ?? 20,
      includePaths: options.includePaths ?? ["*tender*", "*מכרז*", "*publish*"],
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Firecrawl crawl ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// ===== Internals =====

async function firecrawlScrape(url, opts = {}) {
  const res = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, ...opts }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Firecrawl: ${data.error || "unknown"}`);
  return data.data || {};
}

// ===== Standalone test (node firecrawl-fallback.js) =====
if (import.meta.url === `file://${process.argv[1]}`) {
  const targetUrl = process.argv[2] || "https://www.ashkelon.muni.il/tenders/";
  console.log(`Testing fetch: ${targetUrl}`);

  fetchWithFirecrawlFallback(
    { name: "test", url: targetUrl, use_firecrawl: true },
    {
      polling: { user_agent: "BEE-tender-tracker/0.1.5", timeout_ms: 15000 },
    }
  )
    .then((r) => {
      console.log(`Method: ${r.method}`);
      console.log(`HTML length: ${r.html?.length || 0}`);
      console.log(`First 500 chars: ${(r.html || "").slice(0, 500)}`);
    })
    .catch((e) => console.error(`Error: ${e.message}`));
}
