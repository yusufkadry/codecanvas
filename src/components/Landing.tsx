import { useState } from "react";
import { useStore } from "../lib/store";
import { hasAnyKey } from "../lib/providers";
import { route } from "../lib/router";
import { timeAgo } from "../lib/db";

export function Landing() {
  const [value, setValue] = useState("");
  const keys = useStore((s) => s.keys);
  const models = useStore((s) => s.models);
  const build = useStore((s) => s.build);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const autoRoute = useStore((s) => s.autoRoute);
  const manualChoice = useStore((s) => s.manualChoice);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);

  const keysReady = hasAnyKey(keys);
  const preview = value.trim() && keysReady && autoRoute ? route(value, keys, models) : null;
  const recent = projects.slice(0, 5);

  function submit() {
    const prompt = value.trim();
    if (!prompt) return;
    if (!keysReady) {
      setSettingsOpen(true);
      return;
    }
    void build(prompt);
  }

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="wordmark">
          <em>Code</em>Canvas
        </span>
        <nav className="landing-nav">
          <a href="https://github.com/" target="_blank" rel="noreferrer" className="quiet-link">
            Source
          </a>
          <button className="quiet-link as-button" onClick={() => setSettingsOpen(true)}>
            Keys
          </button>
        </nav>
      </header>

      <main className="landing-main">
        <h1 className="hero-q">What do you want to build?</h1>
        <div className="hero-input-wrap">
          <input
            className="hero-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="a kanban board with drag and drop…"
            aria-label="Describe the app to build"
          />
          <button className="hero-go" onClick={submit} disabled={!value.trim()}>
            build ↵
          </button>
        </div>
        <div className="hero-hints">
          <button className="chip as-button" onClick={() => setSettingsOpen(true)}>
            {keysReady ? "keys ✓" : "add a key to start"}
          </button>
          <span className="chip">
            {autoRoute
              ? preview
                ? `auto → ${preview.model}`
                : "model: auto"
              : `model: ${manualChoice?.model ?? "auto"}`}
          </span>
          <span className="chip ghost">runs entirely in your browser</span>
        </div>

        {recent.length > 0 && (
          <section className="recent" aria-label="Recent projects">
            <div className="recent-head">Recent — saved on this device</div>
            <ul className="recent-list">
              {recent.map((p) => (
                <li key={p.id}>
                  <button className="recent-row as-button" onClick={() => void openProject(p.id)}>
                    <span className="recent-title">{p.title}</span>
                    <span className="recent-meta">
                      {p.fileCount} files · {timeAgo(p.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="landing-foot">
        <p>
          Open source. No backend. Your keys, code, and history stay on this machine — verify it in
          the network tab.
        </p>
      </footer>
    </div>
  );
}
