import { useState } from "react";
import { useStore } from "../lib/store";
import type { Candidate } from "../lib/store";
import { fmtUsd } from "../lib/pricing";

function CandidateCol({ cand }: { cand: Candidate }) {
  const pickWinner = useStore((s) => s.pickWinner);
  const paths = Object.keys(cand.files).sort();
  const [open, setOpen] = useState<string | null>(null);
  const shown = open && cand.files[open] !== undefined ? open : paths[0] ?? null;
  const canPick = (cand.status === "done" || cand.status === "aborted") && paths.length > 0;

  return (
    <div className={`cand cand-${cand.status}`}>
      <div className="cand-head">
        <span className={`status-dot status-${cand.status === "streaming" ? "thinking" : cand.status === "done" ? "ready" : "error"}`} />
        <span className="cand-model mono">{cand.label}</span>
        <span className="cand-count">{paths.length} files</span>
      </div>
      {cand.error && <p className="cand-error mono">{cand.error}</p>}
      <div className="cand-files">
        {paths.map((p) => (
          <button
            key={p}
            className={`cand-file as-button mono ${shown === p ? "active" : ""}`}
            onClick={() => setOpen(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <pre className="cand-code mono">{shown ? cand.files[shown] : cand.narration || "…"}</pre>
      <div className="cand-foot">
        {cand.receipt && (
          <span className="cand-receipt mono">
            {fmtUsd(cand.receipt.costUsd)} · {(cand.receipt.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <button className="btn-primary btn-sm" disabled={!canPick} onClick={() => void pickWinner(cand.key)}>
          Use this one
        </button>
      </div>
    </div>
  );
}

export function CompareView() {
  const compare = useStore((s) => s.compare);
  const discardCompare = useStore((s) => s.discardCompare);
  if (!compare) return null;

  const allSettled = compare.candidates.every((c) => c.status !== "streaming");

  return (
    <section className="pane compare-pane" aria-label="Model comparison">
      <div className="pane-head">
        Compare — {compare.candidates.length} models
        <button className="quiet-link as-button" onClick={discardCompare} disabled={!allSettled}>
          discard all
        </button>
      </div>
      <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${compare.candidates.length}, minmax(0,1fr))` }}>
        {compare.candidates.map((c) => (
          <CandidateCol key={c.key} cand={c} />
        ))}
      </div>
    </section>
  );
}
