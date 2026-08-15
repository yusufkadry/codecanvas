import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import type { ChatEntry } from "../lib/store";
import { fmtUsd } from "../lib/pricing";
import type { FileChange } from "../lib/types";

function Receipt({ entry }: { entry: ChatEntry }) {
  const r = entry.receipt;
  if (!r) return null;
  return (
    <div
      className="receipt"
      title={r.usage.estimated ? "token counts estimated" : "token counts reported by provider"}
    >
      <span>{r.model}</span>
      <span>
        {r.usage.inputTokens.toLocaleString()} in · {r.usage.outputTokens.toLocaleString()} out
        {r.usage.estimated ? " (est)" : ""}
      </span>
      <span>{fmtUsd(r.costUsd)}</span>
      <span>{(r.durationMs / 1000).toFixed(1)}s</span>
      {r.fileCount > 0 && <span>{r.fileCount} files</span>}
    </div>
  );
}

function Diffs({ changes }: { changes: FileChange[] }) {
  const real = changes.filter((c) => c.added + c.removed > 0 || c.isNew);
  if (real.length === 0) return null;
  const totalAdd = real.reduce((n, c) => n + c.added, 0);
  const totalDel = real.reduce((n, c) => n + c.removed, 0);
  return (
    <details className="diffs">
      <summary>
        {real.length} file{real.length > 1 ? "s" : ""} changed{" "}
        <span className="diff-add">+{totalAdd}</span> <span className="diff-del">−{totalDel}</span>
      </summary>
      {real.map((c) => (
        <details key={c.path} className="diff-file">
          <summary className="mono">
            {c.path} {c.isNew && <span className="diff-new">new</span>}{" "}
            <span className="diff-add">+{c.added}</span> <span className="diff-del">−{c.removed}</span>
          </summary>
          {c.lines ? (
            <pre className="diff-body mono">
              {c.lines.map((l, i) => (
                <div key={i} className={`dl dl-${l.t}`}>
                  {l.t === "add" ? "+ " : l.t === "del" ? "− " : "  "}
                  {l.s}
                </div>
              ))}
            </pre>
          ) : (
            <p className="diff-note">{c.isNew ? "new file" : "diff too large to render — counts only"}</p>
          )}
        </details>
      ))}
    </details>
  );
}

export function ChatPane() {
  const chat = useStore((s) => s.chat);
  const writingFile = useStore((s) => s.writingFile);
  const buildBusy = useStore((s) => s.buildBusy);
  const mode = useStore((s) => s.mode);
  const setPref = useStore((s) => s.setPref);
  const compareOn = useStore((s) => s.compareOn);
  const compareModels = useStore((s) => s.compareModels);
  const dispatch = useStore((s) => s.dispatch);
  const restoreCheckpoint = useStore((s) => s.restoreCheckpoint);
  const checkpoints = useStore((s) => s.checkpoints);
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat, writingFile]);

  const compareReady = compareModels.length >= 2;

  function send() {
    const p = value.trim();
    if (!p) return;
    setValue("");
    dispatch(p);
  }

  return (
    <section className="pane chat-pane" aria-label="Chat">
      <div className="pane-head">Conversation</div>
      <div className="chat-scroll" ref={scrollRef}>
        {chat.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-role">
              {m.role === "user" ? "you" : "canvas"}
              {m.mode === "ideate" && <span className="mode-tag"> · ideate</span>}
            </div>
            <div className="msg-body">
              {m.content ||
                (m.role === "assistant" && m.status === "streaming" ? "…" : "")}
            </div>
            {m.status === "queued" && (
              <div className="queue-pill">queued — runs after the current build</div>
            )}
            {(m.status === "error" || m.status === "aborted") && m.error && (
              <div className={`msg-note ${m.status === "aborted" ? "note-abort" : "note-error"}`}>
                {m.error}
              </div>
            )}
            {m.changes && m.changes.length > 0 && <Diffs changes={m.changes} />}
            <Receipt entry={m} />
            {m.checkpointId && checkpoints.some((c) => c.id === m.checkpointId) && (
              <button
                className="restore-btn as-button"
                onClick={() => {
                  if (window.confirm("Restore project files to this checkpoint?"))
                    void restoreCheckpoint(m.checkpointId!);
                }}
              >
                restore this version
              </button>
            )}
          </div>
        ))}
        {writingFile && <div className="writing-pill">writing {writingFile}…</div>}
      </div>
      <div className="chat-controls">
        <div className="mode-seg" role="radiogroup" aria-label="Message mode">
          <button
            className={`mode-btn ${mode === "build" ? "on" : ""}`}
            onClick={() => setPref({ mode: "build" })}
          >
            Build
          </button>
          <button
            className={`mode-btn ${mode === "ideate" ? "on" : ""}`}
            onClick={() => setPref({ mode: "ideate" })}
          >
            Ideate
          </button>
        </div>
        {mode === "build" && (
          <button
            className={`compare-toggle as-button ${compareOn && compareReady ? "on" : ""}`}
            disabled={!compareReady}
            title={
              compareReady
                ? "Run this prompt through your compare candidates and pick a winner"
                : "Pick 2–3 compare candidates in Keys & models"
            }
            onClick={() => setPref({ compareOn: !compareOn })}
          >
            ⇄ compare{compareReady ? ` ${compareModels.length}` : ""}
          </button>
        )}
      </div>
      <div className="chat-input-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={
            mode === "ideate"
              ? "ask anything — answers even mid-build…"
              : buildBusy
                ? "describe changes — queues after current build…"
                : "describe changes…"
          }
          aria-label="Message"
        />
        <button onClick={send} disabled={!value.trim()} className="btn-primary btn-sm">
          Send
        </button>
      </div>
    </section>
  );
}
