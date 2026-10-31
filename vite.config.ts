import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths, so the packaged app loads its files from wherever the phone puts it
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})
