import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The CLI, the MCP server and the API handlers are node code. The workspace
    // under `web/` is a browser app, and its tests need a DOM — one harness,
    // two environments, rather than a second test runner.
    environmentMatchGlobs: [['web/**', 'jsdom']],
  },
});
