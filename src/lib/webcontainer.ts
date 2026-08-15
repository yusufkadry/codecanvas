import { WebContainer, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";

let instance: WebContainer | null = null;
let devProc: WebContainerProcess | null = null;
let serverReadyCb: ((url: string) => void) | null = null;

export function onServerReady(cb: (url: string) => void) {
  serverReadyCb = cb;
}

export async function getContainer(): Promise<WebContainer> {
  if (!crossOriginIsolated) {
    throw new Error(
      "This page isn't cross-origin isolated, so WebContainers can't start. Run via `npm run dev` (headers are preconfigured) or deploy with vercel.json intact.",
    );
  }
  if (!instance) {
    instance = await WebContainer.boot({ workdirName: "codecanvas" });
    instance.on("server-ready", (_port, url) => serverReadyCb?.(url));
    instance.on("error", (err) => console.error("[webcontainer]", err));
  }
  return instance;
}

/** Tear down the running project (kills dev server, wipes the FS by rebooting). */
export async function resetContainer(): Promise<void> {
  try {
    devProc?.kill();
  } catch {
    /* already dead */
  }
  devProc = null;
  if (instance) {
    instance.teardown();
    instance = null;
  }
}

function toTree(files: Record<string, string>): FileSystemTree {
  const root: FileSystemTree = {};
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    let node: FileSystemTree = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      const existing = node[dir];
      if (existing && "directory" in existing) {
        node = existing.directory;
      } else {
        const next: FileSystemTree = {};
        node[dir] = { directory: next };
        node = next;
      }
    }
    node[parts[parts.length - 1]] = { file: { contents } };
  }
  return root;
}

export async function mountProject(files: Record<string, string>): Promise<void> {
  const wc = await getContainer();
  await wc.mount(toTree(files));
}

export async function writeProjectFile(path: string, contents: string): Promise<void> {
  const wc = await getContainer();
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) await wc.fs.mkdir(dir, { recursive: true });
  await wc.fs.writeFile(path, contents);
}

export async function runCommand(
  cmd: string,
  args: string[],
  onOutput: (line: string) => void,
): Promise<number> {
  const wc = await getContainer();
  const proc = await wc.spawn(cmd, args);
  proc.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    }),
  );
  return proc.exit;
}

export async function startDevServer(onOutput: (line: string) => void): Promise<void> {
  const wc = await getContainer();
  devProc = await wc.spawn("npm", ["run", "dev"]);
  devProc.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    }),
  );
}
