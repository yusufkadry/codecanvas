import { useStore } from "../lib/store";

const PHASE_COPY: Record<string, string> = {
  thinking: "The model is writing files…",
  installing: "Installing dependencies in your browser…",
  starting: "Starting the dev server…",
};

export function PreviewPane() {
  const previewUrl = useStore((s) => s.previewUrl);
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);

  return (
    <section className="pane preview-pane" aria-label="Live preview">
      <div className="pane-head">
        Preview
        {previewUrl && (
          <a className="quiet-link" href={previewUrl} target="_blank" rel="noreferrer">
            open ↗
          </a>
        )}
      </div>
      {previewUrl ? (
        <iframe className="preview-frame" src={previewUrl} title="App preview" allow="cross-origin-isolated" />
      ) : (
        <div className="preview-wait">
          {phase === "error" ? (
            <div className="preview-error">
              <strong>Build failed.</strong>
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className="pulse-dot" aria-hidden />
              <p>{PHASE_COPY[phase] ?? "Waiting for a build…"}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
