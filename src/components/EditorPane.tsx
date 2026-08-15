import { useRef } from "react";
import Editor from "@monaco-editor/react";
import { useStore } from "../lib/store";
import { languageFor } from "../lib/monaco";

export function EditorPane() {
  const activeFile = useStore((s) => s.activeFile);
  const files = useStore((s) => s.files);
  const editFile = useStore((s) => s.editFile);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!activeFile || files[activeFile] === undefined) {
    return (
      <section className="pane editor-pane editor-empty" aria-label="Editor">
        <p>Pick a file — or describe an app and watch this fill in.</p>
      </section>
    );
  }

  return (
    <section className="pane editor-pane" aria-label="Editor">
      <div className="pane-head mono">{activeFile}</div>
      <Editor
        path={activeFile}
        language={languageFor(activeFile)}
        value={files[activeFile]}
        theme="vs-dark"
        onChange={(v) => {
          if (v === undefined) return;
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => editFile(activeFile, v), 350);
        }}
        options={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          padding: { top: 10 },
        }}
      />
    </section>
  );
}
