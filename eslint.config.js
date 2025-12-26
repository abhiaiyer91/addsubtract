import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  }
);
