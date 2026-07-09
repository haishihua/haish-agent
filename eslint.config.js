import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/** Lint app-web JSX first. Electron TypeScript is covered by `tsc`. */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'app-web/dist/**',
      'build/**',
      'release/**',
      'scripts/**',
      'src/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['app-web/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/display-name': 'off',
      // Legacy patterns: surface as warnings so lint stays usable without rewriting behavior.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react/no-unescaped-entities': 'off',
      'react/jsx-key': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-useless-escape': 'warn',
      'no-cond-assign': 'warn',
      'no-control-regex': 'warn',
      'prefer-const': 'off',
      'no-redeclare': 'warn',
      'no-case-declarations': 'warn',
    },
  },
];
