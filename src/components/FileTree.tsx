import { useMemo } from "react";
import { useStore } from "../lib/store";

interface Node {
  name: string;
  path: string;
  children?: Node[];
}

function buildTree(paths: string[]): Node[] {
  const root: Node[] = [];
  for (const path of paths.sort()) {
    const parts = path.split("/");
    let level = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && !!n.children !== isFile);
      if (!node) {
        node = { name: part, path: acc, children: isFile ? undefined : [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }
  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root);
  return root;
}

function TreeLevel({ nodes, depth }: { nodes: Node[]; depth: number }) {
  const activeFile = useStore((s) => s.activeFile);
  const setActiveFile = useStore((s) => s.setActiveFile);
  return (
    <ul className="tree-level" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((n) => (
        <li key={n.path} role="treeitem" aria-selected={activeFile === n.path}>
          {n.children ? (
            <>
              <span className="tree-dir" style={{ paddingLeft: depth * 12 }}>
                {n.name}/
              </span>
              <TreeLevel nodes={n.children} depth={depth + 1} />
            </>
          ) : (
            <button
              className={`tree-file as-button ${activeFile === n.path ? "active" : ""}`}
              style={{ paddingLeft: depth * 12 }}
              onClick={() => setActiveFile(n.path)}
            >
              {n.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FileTree() {
  const files = useStore((s) => s.files);
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  return (
    <nav className="pane tree-pane" aria-label="Project files">
      <div className="pane-head">Files</div>
      {tree.length === 0 ? <div className="tree-empty">No files yet</div> : <TreeLevel nodes={tree} depth={0} />}
    </nav>
  );
}
