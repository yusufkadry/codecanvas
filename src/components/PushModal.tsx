import { useState } from "react";
import { useStore } from "../lib/store";
import { openPullRequest, pushToNewRepo } from "../lib/github";
import { scanDependencies } from "../lib/osv";
import { fmtUsd } from "../lib/pricing";
import type { PushStep, VulnFinding } from "../lib/types";

const NEW_STEPS = ["auth", "repo", "upload", "tree", "commit", "branch"] as const;
const PR_STEPS = ["auth", "repo", "upload", "tree", "commit", "branch", "pr"] as const;

const STEP_LABEL: Record<string, string> = {
  auth: "Checking token",
  repo: "Repository",
  upload: "Uploading files",
  tree: "Building tree",
  commit: "Creating commit",
  branch: "Updating branch",
  pr: "Opening pull request",
};

export function PushModal() {
  const open = useStore((s) => s.pushOpen);
  const setOpen = useStore((s) => s.setPushOpen);
  const files = useStore((s) => s.files);
  const keys = useStore((s) => s.keys);
  const prompt = useStore((s) => s.prompt);
  const chat = useStore((s) => s.chat);

  const [mode, setMode] = useState<"new" | "pr">("new");
  const [repoName, setRepoName] = useState("");
  const [repoFull, setRepoFull] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [steps, setSteps] = useState<PushStep[]>([]);
  const [running, setRunning] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [scan, setScan] = useState<{ done: boolean; findings: VulnFinding[]; error?: string } | null>(null);

  if (!open) return null;

  const fileCount = Object.keys(files).length;
  const lastReceipt = [...chat].reverse().find((m) => m.receipt)?.receipt;

  function initSteps(kind: "new" | "pr") {
    const list = kind === "new" ? NEW_STEPS : PR_STEPS;
    setSteps(list.map((s) => ({ label: STEP_LABEL[s], state: "pending" })));
    return list as readonly string[];
  }

  function markStep(list: readonly string[], id: string, detail?: string) {
    setSteps((prev) =>
      prev.map((s, i) => {
        const idx = list.indexOf(id);
        if (i < idx) return { ...s, state: "done" };
        if (i === idx) return { ...s, state: "active", detail };
        return s;
      }),
    );
  }

  function finishSteps(ok: boolean, failDetail?: string) {
    setSteps((prev) =>
      prev.map((s) =>
        s.state === "active" ? { ...s, state: ok ? "done" : "failed", detail: failDetail ?? s.detail } : ok ? { ...s, state: "done" } : s,
      ),
    );
  }

  async function runScan() {
    const pkg = files["package.json"];
    if (!pkg) {
      setScan({ done: true, findings: [], error: "no package.json in project" });
      return;
    }
    setScan({ done: false, findings: [] });
    const res = await scanDependencies(pkg);
    setScan({ done: true, findings: res.findings, error: res.error });
  }

  function prBody(): string {
    const receiptLine = lastReceipt
      ? `\n\n**Build receipt** — ${lastReceipt.model} · ${lastReceipt.usage.inputTokens.toLocaleString()} in / ${lastReceipt.usage.outputTokens.toLocaleString()} out${lastReceipt.usage.estimated ? " (est)" : ""} · ${fmtUsd(lastReceipt.costUsd)} · ${(lastReceipt.durationMs / 1000).toFixed(1)}s`
      : "";
    const scanLine =
      scan?.done && !scan.error
        ? scan.findings.length === 0
          ? "\n**Dependency scan (OSV.dev):** no known vulnerabilities in pinned versions."
          : `\n**Dependency scan (OSV.dev):** ${scan.findings.length} package(s) flagged — see PR checks below.`
        : "";
    return `Built from the prompt:\n\n> ${prompt}\n\n**Files:** ${Object.keys(files).length}${receiptLine}${scanLine}\n\n---\n*Generated with [CodeCanvas](https://codecanvas.dev) — open-source, client-side AI builder.*`;
  }

  async function go() {
    setRunning(true);
    setFailure(null);
    setResultUrl(null);
    const list = initSteps(mode);
    try {
      if (!keys.github) throw new Error("Add a GitHub token in Keys first.");
      if (mode === "new") {
        if (!repoName.trim()) throw new Error("Repository name is required.");
        const res = await pushToNewRepo({
          token: keys.github,
          name: repoName.trim(),
          isPrivate,
          files,
          commitMessage: `CodeCanvas: ${prompt.slice(0, 72) || "initial build"}`,
          onProgress: (step, detail) => markStep(list, step, detail),
        });
        finishSteps(true);
        setResultUrl(res.repoUrl);
      } else {
        if (!/^[^/\s]+\/[^/\s]+$/.test(repoFull.trim()))
          throw new Error("Use the owner/repo format, e.g. yusufkadry/myapp.");
        const res = await openPullRequest({
          token: keys.github,
          repoFull: repoFull.trim(),
          files,
          title: `CodeCanvas: ${prompt.slice(0, 72) || "update"}`,
          body: prBody(),
          onProgress: (step, detail) => markStep(list, step, detail),
        });
        finishSteps(true);
        setResultUrl(res.prUrl);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finishSteps(false, msg);
      setFailure(msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !running && setOpen(false)}>
      <div className="modal" role="dialog" aria-label="Push to GitHub" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ship it</h2>
          <button className="quiet-link as-button" onClick={() => setOpen(false)} disabled={running}>
            close
          </button>
        </div>

        <div className="seg">
          <button className={`seg-btn ${mode === "new" ? "on" : ""}`} onClick={() => setMode("new")} disabled={running}>
            New repository
          </button>
          <button className={`seg-btn ${mode === "pr" ? "on" : ""}`} onClick={() => setMode("pr")} disabled={running}>
            PR to existing
          </button>
        </div>

        {mode === "new" ? (
          <>
            <label className="field">
              <span>Repository name</span>
              <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="my-app" disabled={running} />
            </label>
            <label className="check">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} disabled={running} />
              <span>Private repository</span>
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Target repository (owner/repo)</span>
              <input value={repoFull} onChange={(e) => setRepoFull(e.target.value)} placeholder="you/your-repo" disabled={running} />
            </label>
            <p className="field-hint">
              Changes go to a new <code>codecanvas/…</code> branch and open as a pull request — your
              default branch is never touched directly.
            </p>
          </>
        )}

        <div className="scan-row">
          <button className="btn-ghost btn-sm" onClick={runScan} disabled={running || scan?.done === false}>
            {scan?.done === false ? "Scanning…" : "Scan dependencies"}
          </button>
          {scan?.done && (
            <span className={`scan-result ${scan.findings.length ? "warn" : "ok"}`}>
              {scan.error
                ? `scan unavailable (${scan.error})`
                : scan.findings.length === 0
                  ? "no known vulnerabilities"
                  : `${scan.findings.length} package(s) flagged`}
            </span>
          )}
        </div>
        {scan?.done && scan.findings.length > 0 && (
          <ul className="scan-findings mono">
            {scan.findings.map((f) => (
              <li key={f.pkg}>
                {f.pkg}@{f.version} — {f.ids.join(", ")}
              </li>
            ))}
          </ul>
        )}

        {steps.length > 0 && (
          <ol className="push-steps">
            {steps.map((s, i) => (
              <li key={i} className={`push-step ${s.state}`}>
                <span className="push-step-mark" aria-hidden />
                <span>{s.label}</span>
                {s.detail && <span className="push-step-detail">{s.detail}</span>}
              </li>
            ))}
          </ol>
        )}

        {failure && <p className="modal-error">{failure}</p>}
        {resultUrl && (
          <p className="push-done">
            Done →{" "}
            <a href={resultUrl} target="_blank" rel="noreferrer">
              {resultUrl}
            </a>
          </p>
        )}

        <div className="modal-actions">
          <button className="btn-primary" onClick={go} disabled={running || fileCount === 0}>
            {running ? "Working…" : mode === "new" ? `Push ${fileCount} files` : "Open pull request"}
          </button>
        </div>
      </div>
    </div>
  );
}
