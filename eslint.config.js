import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      // Paperclip CLI helper scripts (Node.js scripts, not part of the app)
      'pc_api.sh',
      'pc_node_api.js',
      'tmp_*.sh',
      'tmp_*.ts',
      'commit_msg.txt',
    ],
  },
);
