import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // The gift-kit libraries are only ever reached through dynamic import(), which
  // Vite's dependency optimiser does not crawl. Without this, the first export
  // click in dev triggers discovery of a ~950 kB CJS bundle and a full page
  // reload -- taking the generated wallets in React state with it.
  optimizeDeps: {
    include: ['exceljs', 'pdf-lib', 'pdfjs-dist', 'fflate', 'zxing-wasm/reader'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
