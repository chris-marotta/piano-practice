import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      // Relative URLs so it works under a GitHub Pages subpath (/<repo>/).
      manifest: {
        name: 'Piano Practice',
        short_name: 'Piano',
        description: 'Daily piano scale and chord practice with spaced repetition.',
        start_url: './',
        scope: './',
        id: './',
        display: 'standalone',
        orientation: 'landscape',
        theme_color: '#12161c',
        background_color: '#12161c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline: shell, fonts (woff2 only; every target browser supports it),
        // piano samples, icons.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,mp3}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Contrast tests read the shipped stylesheets with ?raw (CSS is stubbed out otherwise).
    css: { include: [/src\/ui\/(tokens|progress|app)\.css/] },
  },
})
