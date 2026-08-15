import { useEffect, useRef } from "react";
import { useStore } from "../lib/store";

const PHASE_LABEL: Record<string, string> = {
  thinking: "writing files",
  installing: "npm install",
  starting: "starting dev server",
  ready: "live",
  error: "error",
};

export function LogBar() {
  const logs = useStore((s) => s.logs);
  const open = useStore((s) => s.logsOpen);
  const setOpen = useStore((s) => s.setLogsOpen);
  const phase = useStore((s) => s.phase);
  const lastChoice = useStore((s) => s.lastChoice);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [logs, open]);

  return (
    <div className={`logbar ${open ? "open" : ""}`}>
      <button className="logbar-head as-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`status-dot status-${phase}`} aria-hidden />
        <span className="logbar-title">{PHASE_LABEL[phase] ?? "idle"}</span>
        {lastChoice && <span className="logbar-model mono">{lastChoice.model}</span>}
        <span className="logbar-toggle">{open ? "hide logs" : "show logs"}</span>
      </button>
      {open && (
        <div className="logbar-body mono" ref={scrollRef} role="log">
          {logs.map((l, i) => (
            <div key={i} className={`log-${l.kind}`}>
              {l.kind === "cmd" ? "$ " : ""}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
