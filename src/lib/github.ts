/**
 * GitHub push via the Git Data API, straight from the browser with the
 * user's PAT. Every step reports progress so failures are never silent —
 * that reliability is a core product goal, not a nicety.
 *
 * New repo  → create repo → blobs → tree → commit (no parent) → refs/heads/main
 * Existing  → resolve default branch → blobs → tree (base = HEAD tree)
 *             → commit (parent = HEAD) → new branch → pull request
 */

const API = "https://api.github.com";

export interface PushProgress {
  (step: string, detail?: string): void;
}

interface Gh {
  token: string;
}

async function gh<T>(g: Gh, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${g.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = `${res.status} — ${j.message ?? JSON.stringify(j).slice(0, 200)}`;
    } catch {
      /* keep status only */
    }
    throw new Error(`GitHub ${method} ${path}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export async function getViewer(token: string): Promise<{ login: string }> {
  return gh({ token }, "GET", "/user");
}

async function createBlobs(
  g: Gh,
  repo: string,
  files: Record<string, string>,
  onProgress: PushProgress,
): Promise<{ path: string; sha: string }[]> {
  const entries = Object.entries(files);
  const out: { path: string; sha: string }[] = [];
  const BATCH = 6;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const shas = await Promise.all(
      batch.map(([path, content]) =>
        gh<{ sha: string }>(g, "POST", `/repos/${repo}/git/blobs`, {
          content,
          encoding: "utf-8",
        }).then((r) => ({ path, sha: r.sha })),
      ),
    );
    out.push(...shas);
    onProgress("upload", `${Math.min(i + BATCH, entries.length)}/${entries.length} files`);
  }
  return out;
}

export interface NewRepoResult {
  repoUrl: string;
  commitUrl: string;
}

export async function pushToNewRepo(opts: {
  token: string;
  name: string;
  isPrivate: boolean;
  files: Record<string, string>;
  commitMessage: string;
  onProgress: PushProgress;
}): Promise<NewRepoResult> {
  const g = { token: opts.token };
  const { onProgress } = opts;

  onProgress("auth");
  const me = await getViewer(opts.token);

  onProgress("repo");
  const repo = await gh<{ full_name: string; html_url: string }>(g, "POST", "/user/repos", {
    name: opts.name,
    private: opts.isPrivate,
    auto_init: false,
    description: "Built with CodeCanvas",
  });

  onProgress("upload", `0/${Object.keys(opts.files).length} files`);
  const blobs = await createBlobs(g, repo.full_name, opts.files, onProgress);

  onProgress("tree");
  const tree = await gh<{ sha: string }>(g, "POST", `/repos/${repo.full_name}/git/trees`, {
    tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
  });

  onProgress("commit");
  const commit = await gh<{ sha: string; html_url: string }>(
    g,
    "POST",
    `/repos/${repo.full_name}/git/commits`,
    { message: opts.commitMessage, tree: tree.sha, parents: [] },
  );

  onProgress("branch");
  await gh(g, "POST", `/repos/${repo.full_name}/git/refs`, {
    ref: "refs/heads/main",
    sha: commit.sha,
  });

  void me;
  return { repoUrl: repo.html_url, commitUrl: commit.html_url };
}

// --------------------------------------------------------------- repo import

const SKIP_DIRS = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage|\.cache)(\/|$)/;
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|html|md|txt|svg|ya?ml|toml|env|example|lock|editorconfig|prettierrc|eslintrc)$/i;
const DOTFILE_ALLOW = new Set([".gitignore", ".env.example", ".prettierrc", ".eslintrc", ".npmrc"]);
const MAX_FILE_BYTES = 200_000;
const MAX_FILES = 250;

function ghHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function ghGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: ghHeaders(token) });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = `${res.status} — ${j.message ?? ""}`;
    } catch {
      /* status only */
    }
    throw new Error(`GitHub GET ${path}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

export interface ImportResult {
  files: Record<string, string>;
  defaultBranch: string;
  skipped: number;
}

/**
 * Pull a repo's text files straight from the browser. Token optional for
 * public repos (unauthenticated GitHub rate limits apply), required for
 * private ones.
 */
export async function fetchRepoFiles(
  token: string,
  repoFull: string,
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const repo = await ghGet<{ default_branch: string }>(token, `/repos/${repoFull}`);
  const tree = await ghGet<{
    tree: { path: string; type: string; sha: string; size?: number }[];
    truncated: boolean;
  }>(token, `/repos/${repoFull}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);

  const wanted = tree.tree.filter((e) => {
    if (e.type !== "blob" || SKIP_DIRS.test(e.path)) return false;
    if ((e.size ?? 0) > MAX_FILE_BYTES) return false;
    const base = e.path.split("/").pop() ?? "";
    return TEXT_EXT.test(e.path) || DOTFILE_ALLOW.has(base) || base === "LICENSE";
  });
  const skipped = tree.tree.filter((e) => e.type === "blob").length - wanted.length;

  if (wanted.length === 0) throw new Error("No importable text files found in this repo.");
  if (wanted.length > MAX_FILES)
    throw new Error(`Repo has ${wanted.length} text files — over the ${MAX_FILES}-file import cap for now.`);
  if (tree.truncated)
    throw new Error("GitHub truncated the file tree (repo too large to import in-browser).");

  const files: Record<string, string> = {};
  const BATCH = 6;
  let done = 0;
  onProgress(0, wanted.length);
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = wanted.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (e) => {
        const blob = await ghGet<{ content: string; encoding: string }>(
          token,
          `/repos/${repoFull}/git/blobs/${e.sha}`,
        );
        files[e.path] =
          blob.encoding === "base64" ? decodeBase64Utf8(blob.content) : blob.content;
        done++;
        onProgress(done, wanted.length);
      }),
    );
  }
  return { files, defaultBranch: repo.default_branch, skipped };
}

export interface PrResult {
  prUrl: string;
  branch: string;
}

export async function openPullRequest(opts: {
  token: string;
  /** "owner/repo" */
  repoFull: string;
  files: Record<string, string>;
  title: string;
  body: string;
  onProgress: PushProgress;
}): Promise<PrResult> {
  const g = { token: opts.token };
  const { onProgress, repoFull } = opts;

  onProgress("auth");
  await getViewer(opts.token);

  onProgress("repo");
  const repo = await gh<{ default_branch: string }>(g, "GET", `/repos/${repoFull}`);
  const base = repo.default_branch;

  const head = await gh<{ object: { sha: string } }>(g, "GET", `/repos/${repoFull}/git/ref/heads/${base}`);
  const headCommit = await gh<{ tree: { sha: string } }>(
    g,
    "GET",
    `/repos/${repoFull}/git/commits/${head.object.sha}`,
  );

  onProgress("upload", `0/${Object.keys(opts.files).length} files`);
  const blobs = await createBlobs(g, repoFull, opts.files, onProgress);

  onProgress("tree");
  const tree = await gh<{ sha: string }>(g, "POST", `/repos/${repoFull}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
  });

  onProgress("commit");
  const commit = await gh<{ sha: string }>(g, "POST", `/repos/${repoFull}/git/commits`, {
    message: opts.title,
    tree: tree.sha,
    parents: [head.object.sha],
  });

  onProgress("branch");
  const branch = `codecanvas/${Date.now().toString(36)}`;
  await gh(g, "POST", `/repos/${repoFull}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: commit.sha,
  });

  onProgress("pr");
  const pr = await gh<{ html_url: string }>(g, "POST", `/repos/${repoFull}/pulls`, {
    title: opts.title,
    head: branch,
    base,
    body: opts.body,
  });

  return { prUrl: pr.html_url, branch };
}
