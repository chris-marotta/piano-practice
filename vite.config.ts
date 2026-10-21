import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Contrast tests read the shipped stylesheets with ?raw (CSS is stubbed out otherwise).
    css: { include: [/src\/ui\/(tokens|progress)\.css/] },
  },
})
