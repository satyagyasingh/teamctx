export class StalenessError extends Error {
  constructor() {
    super("Context updated by a teammate — please refresh and try again.");
    this.name = "StalenessError";
  }
}

async function proxyGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = new Error(`GitHub proxy error: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function loadProjectConfig() {
  return proxyGet("/api/github?action=config");
}

export async function loadSharedTree() {
  const { content, sha } = await proxyGet("/api/github?action=file&path=shared.json");
  return { workstream: JSON.parse(content), sha };
}

export async function loadContributions() {
  try {
    const { content, sha } = await proxyGet("/api/github?action=file&path=contributions.jsonl");
    const contributions = content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { contributions, sha };
  } catch (err) {
    if (err.status === 404) return { contributions: [], sha: null };
    throw err;
  }
}

export async function checkSharedTreeSha() {
  const { sha } = await proxyGet("/api/github?action=file&path=shared.json");
  return sha;
}

export async function writeSharedTree(workstream, sha) {
  const res = await fetch("/api/github?action=file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "shared.json",
      content: JSON.stringify(workstream, null, 2),
      sha,
      message: `web: update shared context`,
    }),
  });
  if (res.status === 409) throw new StalenessError();
  if (!res.ok) {
    const e = new Error(`Write failed: ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function appendContribution(entry) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let currentSha = undefined;
    let existingContent = "";

    try {
      const { content, sha } = await proxyGet("/api/github?action=file&path=contributions.jsonl");
      currentSha = sha;
      existingContent = content;
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    const newContent = existingContent
      ? existingContent.replace(/\n*$/, "\n") + JSON.stringify(entry) + "\n"
      : JSON.stringify(entry) + "\n";
    const bodyObj = {
      path: "contributions.jsonl",
      content: newContent,
      message: `web: log contribution by ${entry.author}`,
    };
    if (currentSha !== undefined) bodyObj.sha = currentSha;

    const res = await fetch("/api/github?action=file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });

    if (res.status === 409 && attempt === 0) continue;
    if (res.status === 409) throw new StalenessError();
    if (!res.ok) throw new Error(`Append failed: ${res.status}`);
    return res.json();
  }
}
