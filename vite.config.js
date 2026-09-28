import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The project workspace, built to static files.
 *
 * `web/` holds the interface ported from the standalone app. Everything under
 * `api/` stays a serverless function and is untouched by this build: the output
 * here is static, so it costs none of the twelve functions the plan allows.
 */
export default defineConfig(({ command }) => ({
  root: 'web',
  plugins: [react()],
  // Built under `/app/`, not at the root: Vercel serves a static file before it
  // consults a rewrite, so an `index.html` at the top would shadow the
  // server-rendered home page and every route that rewrites into the server.
  //
  // In development nothing is being shadowed and the app owns the origin, so it
  // serves from the root — otherwise its own routes would sit under a prefix
  // they do not have in production, and `/project/<owner>/<repo>` would 404.
  base: command === 'build' ? '/app/' : '/',
  // `npm run dev` serves the workspace with reloading and hands everything else
  // to the dev server, so the browser sees one origin — which is what makes the
  // session cookie work the way it will in production.
  server: {
    proxy: Object.fromEntries(
      ['/api', '/dev', '/settings', '/signin', '/oauth', '/context']
        .map(p => [p, 'http://localhost:3000']),
    ),
  },
  build: { outDir: '../dist/app', emptyOutDir: true },
}));
