import neostandard from 'neostandard'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist/**', 'public/models/**'] },
  ...neostandard({ semi: false, ignores: ['dist/**'] }),
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        MediaRecorder: 'readonly',
        MediaSource: 'readonly',
        AbortController: 'readonly',
        Audio: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        Image: 'readonly',
        caches: 'readonly',
        ResizeObserver: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...(reactHooks.configs?.['recommended-legacy']?.rules ?? reactHooks.configs.recommended.rules),
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]
