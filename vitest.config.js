import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The workspace is JSX. Everything else in here is plain node code the plugin
  // never touches, so one config still runs both.
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // The CLI, the MCP server and the API handlers are node code. The workspace
    // under `web/` is a browser app, and its tests need a DOM — one harness,
    // two environments, rather than a second test runner.
    environmentMatchGlobs: [['web/**', 'jsdom']],
  },
});
