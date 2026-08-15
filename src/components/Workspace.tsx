import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { ChatPane } from "./ChatPane";
import { FileTree } from "./FileTree";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { LogBar } from "./LogBar";
import { CompareView } from "./CompareView";
import { downloadZip } from "../lib/zip";

interface Layout {
  chat: number;
  tree: number;
  editor: number;
}

const LAYOUT_KEY = "codecanvas.layout.v1";
const DEFAULT_LAYOUT: Layout = { chat: 300, tree: 200, editor: 520 };
const DIVIDER = 6;

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
  } catch {
    /* defaults */
  }
  return DEFAULT_LAYOUT;
}

function clampLayout(next: Layout, containerW: number): Layout {
  const out = { ...next };
  out.chat = Math.min(640, Math.max(200, out.chat));
  out.tree = Math.min(420, Math.max(120, out.tree));
  const editorMax = Math.max(280, containerW - out.chat - out.tree - 3 * DIVIDER - 280);
  out.editor = Math.min(editorMax, Math.max(280, out.editor));
  return out;
}

export function Workspace() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setPushOpen = useStore((s) => s.setPushOpen);
  const setProjectsOpen = useStore((s) => s.setProjectsOpen);
  const startNewProject = useStore((s) => s.startNewProject);
  const fileCount = useStore((s) => Object.keys(s.files).length);
  const files = useStore((s) => s.files);
  const prompt = useStore((s) => s.prompt);
  const comparing = useStore((s) => s.compare !== null);

  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  function startDrag(which: keyof Layout, e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const start = { ...layout };
    const containerW = mainRef.current?.clientWidth ?? window.innerWidth;
    setDragging(true);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setLayout(clampLayout({ ...start, [which]: start[which] + dx }, containerW));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      setLayout((cur) => {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(cur));
        return cur;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

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
          <button className="btn-ghost btn-sm" onClick={() => void startNewProject()}>
            New
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setProjectsOpen(true)}>
            Projects
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => downloadZip(files, prompt || "codecanvas-project")}
            disabled={fileCount === 0}
            title="Download the project as a .zip"
          >
            Export
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setSettingsOpen(true)}>
            Keys
          </button>
          <button className="btn-primary btn-sm" onClick={() => setPushOpen(true)} disabled={fileCount === 0}>
            Ship to GitHub
          </button>
        </div>
      </header>
      {comparing ? (
        <main className="studio-main compare-layout">
          <ChatPane />
          <CompareView />
        </main>
      ) : (
        <main
          className={`studio-main ${dragging ? "dragging" : ""}`}
          ref={mainRef}
          style={{
            gridTemplateColumns: `${layout.chat}px ${DIVIDER}px ${layout.tree}px ${DIVIDER}px ${layout.editor}px ${DIVIDER}px minmax(0, 1fr)`,
          }}
        >
          <ChatPane />
          <div
            className="divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat"
            onPointerDown={(e) => startDrag("chat", e)}
          />
          <FileTree />
          <div
            className="divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file tree"
            onPointerDown={(e) => startDrag("tree", e)}
          />
          <EditorPane />
          <div
            className="divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor"
            onPointerDown={(e) => startDrag("editor", e)}
          />
          <PreviewPane />
        </main>
      )}
      <LogBar />
    </div>
  );
}
