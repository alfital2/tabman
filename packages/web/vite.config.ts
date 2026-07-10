import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the app is served from https://<user>.github.io/tabman/,
// so it needs a base path. Locally (dev/preview) it stays at root.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/tabman/' : '/',
  plugins: [react()],
});
