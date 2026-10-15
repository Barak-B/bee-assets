import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Served from the root of its own Cloudflare Pages project.
  base: '/',
  resolve: {
    alias: {
      // Pure TS package shared with the (future) bee-live quotes module.
      '@bee/quote-core': fileURLToPath(new URL('../../packages/quote-core/src/index.ts', import.meta.url)),
    },
  },
  plugins: [
    VitePWA({
      // A new version waits for the user (banner in main.ts) — no reload mid-survey.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon.svg', 'icons.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'B.E.E סקר אתר סולארי',
        short_name: 'BEE Survey',
        description: 'סקר אתר סולארי — Collect לכוורת B.E.E / Wave 54',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1c24',
        theme_color: '#0f1c24',
        lang: 'he',
        dir: 'rtl',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // App shell + fonts + the lazily loaded PDF chunk are all precached, so the
        // surveyor can open the app, fill a survey and export a report with no signal.
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        // jsPDF's optional html()/svg helpers (html2canvas, canvg, dompurify) are never
        // called by this app; keep them out of the offline cache.
        globIgnores: ['**/html2canvas-*.js', '**/index.es-*.js', '**/purify.es-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Customer quote pages and the API are served by Pages Functions — never the app shell.
        navigateFallbackDenylist: [/^\/q\//, /^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
  },
})
