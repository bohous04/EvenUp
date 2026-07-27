// Flat ESLint config shared across the monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.{js,cjs,mjs,ts}',
      'packages/db/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Czech is the unprefixed default locale and English lives under `/en`, so
    // a literal `href="/groups"` is the *Czech* route. Written on an English
    // page it walks the visitor out of `/en` — Czech copy, `<html lang="cs">`,
    // and a `x-locale: cs` header that flips the billing currency with it.
    // Every internal link in the signed-in app had that bug. `<AppLink>`
    // (components/app-link.tsx) resolves the locale internally; this rule is
    // what stops a plain `next/link` from creeping back into the route group.
    // Shared components under `components/` are not covered — several of them
    // are marketing-only and correctly take an already-resolved href — so
    // `AppLink`'s own import is unaffected.
    //
    // The glob avoids `[locale]` on purpose: square brackets are a character
    // class to the matcher, so spelling that segment out would silently match
    // nothing. `(app)` is literal (no leading extglob character).
    files: ['apps/web/src/app/**/(app)/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message:
                'Use <AppLink> from @/components/app-link — a bare href is the Czech route and breaks /en.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
