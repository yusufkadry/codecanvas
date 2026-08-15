import { useStore } from "../lib/store";
import { ChatPane } from "./ChatPane";
import { FileTree } from "./FileTree";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { LogBar } from "./LogBar";

export function Workspace() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setPushOpen = useStore((s) => s.setPushOpen);
  const fileCount = useStore((s) => Object.keys(s.files).length);
  const prompt = useStore((s) => s.prompt);

  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="wordmark">
          <em>Code</em>Canvas
        </span>
        <span className="studio-project" title={prompt}>
          {prompt || "untitled"}
        </span>
        <div className="studio-actions">
          <button className="btn-ghost btn-sm" onClick={() => setSettingsOpen(true)}>
            Keys
          </button>
          <button className="btn-primary btn-sm" onClick={() => setPushOpen(true)} disabled={fileCount === 0}>
            Ship to GitHub
          </button>
        </div>
      </header>
      <main className="studio-main">
        <ChatPane />
        <FileTree />
        <EditorPane />
        <PreviewPane />
      </main>
      <LogBar />
    </div>
  );
}
