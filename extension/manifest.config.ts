import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Design Easily',
  version: '0.1.0',
  description: 'Visual design editor + AI coding assistant for dev projects',
  permissions: [
    'activeTab',
    'storage',
    'scripting',
    'debugger',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module' as const,
  },
  host_permissions: [
    'http://localhost/*',
    'http://127.0.0.1/*',
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'public/icon16.png',
      '48': 'public/icon48.png',
      '128': 'public/icon128.png',
    },
  },
  content_scripts: [
    {
      matches: ['http://localhost/*', 'http://127.0.0.1/*', '<all_urls>'],
      js: ['src/content/index.ts'],
      css: ['src/content/styles.css'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/content/*'],
      matches: ['<all_urls>'],
    },
  ],
})
