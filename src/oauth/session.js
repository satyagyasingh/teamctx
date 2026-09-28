import { kvGet, keys } from './kv.js';

/**
 * Who is signed in to the browser.
 *
 * Every page of the web layer asks this, and so does every call the workspace
 * makes. It lived inside the OAuth server, which meant a second function could
 * only have it by copying it — and a copied session check is one that drifts.
 */

export function readSessionId(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)teamctx_sid=([^;]+)/);
  return match ? match[1] : null;
}

export async function currentUser(req) {
  const sid = readSessionId(req);
  if (!sid) return null;
  return await kvGet(keys.session(sid));
}
