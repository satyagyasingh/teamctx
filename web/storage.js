// Storage seam. localStorage today; swap to /api/store for Upstash later
// without touching callers. The `shared` flag is accepted but ignored here.

export async function loadKey(key, _shared, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function saveKey(key, value, _shared) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled storage — ignore for demo */
  }
}
