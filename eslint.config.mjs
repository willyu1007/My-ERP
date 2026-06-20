import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import workbench from '@willyu1007/web-workbench/eslint';

// Flat config. Type-aware linting is intentionally off for P0a (fast, robust);
// it can be enabled per-package later when the domain layers grow.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/*.config.*',
      '**/next-env.d.ts',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Batch 1 typography lock: ban inline font-size/weight/family (use scale tokens).
  ...workbench,
);
