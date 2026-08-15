import type { DiffLine } from "./types";

/**
 * Classic LCS line diff, dependency-free. Files past 1,200 lines skip the
 * O(n·m) table and return counts only — the UI shows "+X −Y" without a body.
 */
export function diffLines(
  before: string,
  after: string,
): { added: number; removed: number; lines: DiffLine[] | null } {
  const A = before.split("\n");
  const B = after.split("\n");

  if (A.length > 1200 || B.length > 1200) {
    const setA = new Set(A);
    const setB = new Set(B);
    let added = 0;
    let removed = 0;
    for (const l of B) if (!setA.has(l)) added++;
    for (const l of A) if (!setB.has(l)) removed++;
    return { added, removed, lines: null };
  }

  const n = A.length;
  const m = B.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }

  const raw: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      raw.push({ t: "ctx", s: A[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      raw.push({ t: "del", s: A[i] });
      removed++;
      i++;
    } else {
      raw.push({ t: "add", s: B[j] });
      added++;
      j++;
    }
  }
  while (i < n) {
    raw.push({ t: "del", s: A[i++] });
    removed++;
  }
  while (j < m) {
    raw.push({ t: "add", s: B[j++] });
    added++;
  }

  return { added, removed, lines: compress(raw) };
}

/** Keep 2 context lines around each change; collapse long ctx runs to a gap. */
function compress(lines: DiffLine[]): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].t !== "ctx") {
      for (let d = -2; d <= 2; d++) {
        const idx = k + d;
        if (idx >= 0 && idx < lines.length) keep[idx] = true;
      }
    }
  }
  const out: DiffLine[] = [];
  let inGap = false;
  for (let k = 0; k < lines.length; k++) {
    if (keep[k]) {
      out.push(lines[k]);
      inGap = false;
    } else if (!inGap) {
      out.push({ t: "gap", s: "···" });
      inGap = true;
    }
  }
  return out;
}
