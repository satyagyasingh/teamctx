/**
 * The hosted web layer, on your machine.
 *
 * Vercel routes a request three ways — a static file, a serverless function, or
 * the OAuth server — and locally there is nothing doing that. This does it, so
 * the workspace can be clicked through before any of it is deployed.
 *
 * Development only. It is not under `api/`, so Vercel never turns it into a
 * function, and it is outside the `files` whitelist, so it is never published.
 * It is the one place that will mint a session from a token you hand it, which
 * is exactly why it must never be reachable from anything that is deployed.
 */
import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(root, '.env.local') });
loadEnv({ path: join(root, '.env') });

const { app: oauthServer } = await import('./api/oauth-server.js');
const projectsHandler = (await import('./api/projects.js')).default;
const projectHandler = (await import('./api/project/[owner]/[repo].js')).default;
const { kvSet, keys } = await import('./src/oauth/kv.js');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json());

// ---- Signing in, without an OAuth app pointed at localhost ---------------
//
// A GitHub token stands in for the sign-in teamctx would otherwise do. The
// session it makes is the same shape the real callback writes, so everything
// downstream — the roster, the gate, the scope — behaves exactly as deployed.
app.get('/dev/signin', async (req, res) => {
  const token = process.env.TEAMCTX_DEV_TOKEN;
  if (!token) {
    return res.status(500).send('Set TEAMCTX_DEV_TOKEN to a GitHub token that can read your project.');
  }
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) return res.status(502).send(`GitHub refused that token (${r.status}).`);
  const me = await r.json();

  let email = me.email;
  if (!email) {
    const emails = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    }).then(x => (x.ok ? x.json() : []));
    email = emails.find(e => e.primary && e.verified)?.email || emails[0]?.email || null;
  }

  await kvSet(keys.session('dev'), {
    id: String(me.id),
    login: me.login,
    name: me.name || me.login,
    email: email ? String(email).toLowerCase() : null,
    token,
  });
  res.setHeader('Set-Cookie', 'teamctx_sid=dev; Path=/; HttpOnly; SameSite=Lax');
  res.redirect(303, String(req.query.to || '/projects'));
});

app.get('/dev/signout', async (req, res) => {
  await kvSet(keys.session('dev'), null);
  res.setHeader('Set-Cookie', 'teamctx_sid=; Path=/; Max-Age=0');
  res.redirect(303, '/');
});

// ---- The serverless functions, called the way Vercel calls them ----------
const asVercel = (handler, params = () => ({})) => (req, res) => {
  // Express 5 exposes `query` as a getter; Vercel hands the handler a plain
  // object, dynamic segments included.
  const query = { ...req.query, ...params(req) };
  Object.defineProperty(req, 'query', { value: query, configurable: true });
  return handler(req, res);
};

app.all('/api/projects', asVercel(projectsHandler));
app.all('/api/project/:owner/:repo', asVercel(projectHandler, req => ({
  owner: req.params.owner,
  repo: req.params.repo,
})));

// ---- The built workspace -------------------------------------------------
const dist = join(root, 'dist', 'app');
app.use('/app', express.static(dist));
app.get(['/projects', '/project/*splat'], (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(readFileSync(join(dist, 'index.html'), 'utf-8'));
  } catch {
    res.status(500).send('Run `npm run build` first — there is no bundle to serve.');
  }
});

// ---- Everything else is the server that answers today --------------------
app.use((req, res) => oauthServer(req, res));

app.listen(PORT, () => {
  console.log(`\nteamctx dev server → http://localhost:${PORT}`);
  console.log(process.env.TEAMCTX_DEV_TOKEN
    ? `Sign in:  http://localhost:${PORT}/dev/signin\n`
    : 'Set TEAMCTX_DEV_TOKEN in .env.local to sign in without an OAuth app.\n');
});
