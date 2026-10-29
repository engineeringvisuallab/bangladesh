import { defineConfig } from 'vite';

export default defineConfig({
  // './' = relative paths, so the build works from https://<user>.github.io/<repo-name>/
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
