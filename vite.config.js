import { defineConfig } from 'vite';

export default defineConfig({
  base: '/photosynth-io/',
  server: {
    port: 5173,
    open: true,
  },
});
