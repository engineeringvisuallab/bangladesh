import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // './' = relative paths, so the build works from any URL, e.g. https://<user>.github.io/<repo-name>/
  base: './',
  worker: { format: 'es' },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mall: fileURLToPath(new URL('./mall.html', import.meta.url)),
        agro: fileURLToPath(new URL('./agro.html', import.meta.url)),
        farm: fileURLToPath(new URL('./farm.html', import.meta.url)),
      },
    },
  },
});
