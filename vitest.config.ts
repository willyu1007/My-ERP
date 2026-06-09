import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve @my-erp/* to TypeScript source so tests run without a prior build.
// (Runtime/build still use each package's main → dist via pnpm topo order.)
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@my-erp/db': src('./packages/db/src/index.ts'),
      '@my-erp/finance-domain': src('./packages/finance-domain/src/index.ts'),
      '@my-erp/contracts': src('./packages/contracts/src/index.ts'),
      '@my-erp/platform': src('./packages/platform/src/index.ts'),
      '@my-erp/api-client': src('./packages/api-client/src/index.ts'),
      '@my-erp/ui': src('./packages/ui/src/index.ts'),
    },
  },
  // NestJS decorators in unit tests (esbuild needs these enabled explicitly).
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  test: {
    include: ['{apps,packages}/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
