import type { VulnFinding } from "./types";

/**
 * Pre-push dependency check against OSV.dev (free, no key, browser-callable).
 * Best-effort by design: version ranges are pinned to their base version for
 * the query, and any network failure degrades to "scan unavailable" rather
 * than blocking the push.
 */
export async function scanDependencies(
  packageJsonRaw: string,
): Promise<{ ok: boolean; findings: VulnFinding[]; error?: string }> {
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(packageJsonRaw);
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {
    return { ok: false, findings: [], error: "package.json unreadable" };
  }

  const queries = Object.entries(deps)
    .map(([name, range]) => {
      const version = String(range).replace(/^[\^~>=<\s]+/, "").trim();
      if (!/^\d/.test(version)) return null; // skip tags like "latest", workspace:, urls
      return { name, version };
    })
    .filter((q): q is { name: string; version: string } => q !== null);

  if (queries.length === 0) return { ok: true, findings: [] };

  try {
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queries: queries.map((q) => ({
          package: { name: q.name, ecosystem: "npm" },
          version: q.version,
        })),
      }),
    });
    if (!res.ok) return { ok: false, findings: [], error: `OSV ${res.status}` };
    const data = (await res.json()) as { results: { vulns?: { id: string }[] }[] };
    const findings: VulnFinding[] = [];
    data.results.forEach((r, i) => {
      if (r.vulns?.length) {
        findings.push({
          pkg: queries[i].name,
          version: queries[i].version,
          ids: r.vulns.map((v) => v.id).slice(0, 5),
        });
      }
    });
    return { ok: true, findings };
  } catch (e) {
    return { ok: false, findings: [], error: e instanceof Error ? e.message : "network error" };
  }
}
