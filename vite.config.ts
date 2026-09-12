import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// BASE_PATH is set by the GitHub Actions workflow to the Pages base path
// (e.g. "/auctions/" for https://<owner>.github.io/auctions/). Locally it is "/".
const base = process.env.BASE_PATH && process.env.BASE_PATH.trim() !== '' ? process.env.BASE_PATH : '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
