import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  // '.claude/' enthält u. a. die worktree-Kopien paralleler Agenten
  // (.claude/worktrees/…). Ohne diesen Filter lintet ESLint jede Kopie mit und
  // vervielfacht die Fehlerzahlen — daher das gesamte Verzeichnis ignorieren.
  // 'streamdeck-plugin/' ist ein eigenständiges Projekt (eigener tsconfig,
  // eigene Toolchain, kein React) — es wird dort gebaut und geprüft, nicht hier.
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'scripts/**',
      '.claude/',
      'streamdeck-plugin/'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
