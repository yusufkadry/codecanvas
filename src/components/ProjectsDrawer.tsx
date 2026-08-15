import { useStore } from "../lib/store";
import { timeAgo } from "../lib/db";

export function ProjectsDrawer() {
  const open = useStore((s) => s.projectsOpen);
  const setOpen = useStore((s) => s.setProjectsOpen);
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const openProject = useStore((s) => s.openProject);
  const removeProject = useStore((s) => s.removeProject);
  const startNewProject = useStore((s) => s.startNewProject);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={() => setOpen(false)}>
      <aside className="drawer" role="dialog" aria-label="Projects" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Projects</h2>
          <button className="quiet-link as-button" onClick={() => setOpen(false)}>
            close
          </button>
        </div>
        <p className="trust-note">Saved on this device only. Deleting is permanent.</p>
        <button className="btn-primary btn-sm drawer-new" onClick={() => void startNewProject()}>
          New project
        </button>
        {projects.length === 0 ? (
          <p className="drawer-empty">Nothing yet — your builds save here automatically.</p>
        ) : (
          <ul className="drawer-list">
            {projects.map((p) => (
              <li key={p.id} className={`drawer-row ${p.id === projectId ? "current" : ""}`}>
                <button className="drawer-open as-button" onClick={() => void openProject(p.id)}>
                  <span className="drawer-title">{p.title}</span>
                  <span className="drawer-meta">
                    {p.fileCount} files · {timeAgo(p.updatedAt)}
                    {p.id === projectId ? " · open" : ""}
                  </span>
                </button>
                <button
                  className="drawer-delete as-button"
                  aria-label={`Delete ${p.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${p.title}" from this device? This can't be undone.`))
                      void removeProject(p.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
