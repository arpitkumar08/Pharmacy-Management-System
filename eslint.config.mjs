import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '**/dist/**', 'coverage/**', '.bun-install/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/src/**/*.ts'],
    // API inputs are validated by Zod at the controller boundary; legacy
    // service mappings still contain `any` and are typed incrementally.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
