import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@tabkit/core': r('packages/core/src/index.ts'),
      '@tabkit/render': r('packages/render/src/index.ts'),
      '@tabkit/playback': r('packages/playback/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
