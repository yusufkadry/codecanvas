import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { fmtUsd } from "../lib/pricing";

export function ChatPane() {
  const chat = useStore((s) => s.chat);
  const phase = useStore((s) => s.phase);
  const writingFile = useStore((s) => s.writingFile);
  const followUp = useStore((s) => s.followUp);
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat, writingFile]);

  const busy = phase === "thinking" || phase === "installing" || phase === "starting";

  function send() {
    const p = value.trim();
    if (!p || busy) return;
    setValue("");
    void followUp(p);
  }

  return (
    <section className="pane chat-pane" aria-label="Chat">
      <div className="pane-head">Conversation</div>
      <div className="chat-scroll" ref={scrollRef}>
        {chat.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <div className="msg-role">{m.role === "user" ? "you" : "canvas"}</div>
            <div className="msg-body">{m.content || (m.role === "assistant" && busy ? "…" : "")}</div>
            {m.receipt && (
              <div className="receipt" title={m.receipt.usage.estimated ? "token counts estimated" : "token counts reported by provider"}>
                <span>{m.receipt.model}</span>
                <span>
                  {m.receipt.usage.inputTokens.toLocaleString()} in ·{" "}
                  {m.receipt.usage.outputTokens.toLocaleString()} out
                  {m.receipt.usage.estimated ? " (est)" : ""}
                </span>
                <span>{fmtUsd(m.receipt.costUsd)}</span>
                <span>{(m.receipt.durationMs / 1000).toFixed(1)}s</span>
                {m.receipt.fileCount > 0 && <span>{m.receipt.fileCount} files</span>}
              </div>
            )}
          </div>
        ))}
        {writingFile && <div className="writing-pill">writing {writingFile}…</div>}
      </div>
      <div className="chat-input-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={busy ? "building…" : "ask for changes…"}
          disabled={busy}
          aria-label="Ask for changes"
        />
        <button onClick={send} disabled={busy || !value.trim()} className="btn-primary btn-sm">
          Send
        </button>
      </div>
    </section>
  );
}
