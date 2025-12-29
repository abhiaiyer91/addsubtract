import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Production source files - stricter rules
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**', 'src/**/*.test.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Unused variables are warnings but allow underscore prefix to silence
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Allow any for now but encourage proper typing
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prefer ES imports over require
      '@typescript-eslint/no-require-imports': 'warn',
      // Prevent fallthrough bugs in switch statements
      'no-fallthrough': 'error',
      // Allow case declarations with proper scoping
      'no-case-declarations': 'warn',
      // Clean up unnecessary escapes
      'no-useless-escape': 'warn',
      // Prefer const for immutability
      'prefer-const': 'error',
      // No empty blocks (at least add a comment)
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Ensure consistent return types
      '@typescript-eslint/explicit-function-return-type': 'off',
      // No floating promises (catch all async errors)
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  // Test files - more lenient
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'off',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  }
);
