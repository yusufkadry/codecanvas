import { create } from "zustand";
import type {
  BuildReceipt,
  ChatMsg,
  Keys,
  LogLine,
  ModelChoice,
  ModelInfo,
  Phase,
  ProjectMeta,
  ProviderId,
} from "./types";
import { streamChat } from "./providers";
import { SYSTEM_PROMPT, buildEditContext, createStreamParser, README_PROMPT } from "./agent";
import { route } from "./router";
import { estimateCost } from "./pricing";
import { fetchModels, loadModelCache, saveModelCache } from "./models";
import { deleteProjectRecord, getProject, listProjectMetas, upsertProject } from "./db";
import {
  mountProject,
  onServerReady,
  resetContainer,
  runCommand,
  startDevServer,
  writeProjectFile,
} from "./webcontainer";

export interface ChatEntry extends ChatMsg {
  receipt?: BuildReceipt;
}

interface State {
  phase: Phase;
  keys: Keys;
  models: Partial<Record<ProviderId, ModelInfo[]>>;
  modelErrors: Partial<Record<ProviderId, string>>;
  autoRoute: boolean;
  manualChoice: { provider: ProviderId; model: string } | null;
  autoReadme: boolean;
  prompt: string;
  chat: ChatEntry[];
  files: Record<string, string>;
  activeFile: string | null;
  writingFile: string | null;
  previewUrl: string | null;
  logs: LogLine[];
  logsOpen: boolean;
  lastChoice: ModelChoice | null;
  error: string | null;
  settingsOpen: boolean;
  pushOpen: boolean;
  containerLive: boolean;
  projectId: string | null;
  projects: ProjectMeta[];
  projectsOpen: boolean;

  setKeys: (k: Partial<Keys>) => void;
  setAutoRoute: (v: boolean) => void;
  setManualChoice: (v: State["manualChoice"]) => void;
  setAutoReadme: (v: boolean) => void;
  setActiveFile: (p: string | null) => void;
  setSettingsOpen: (v: boolean) => void;
  setPushOpen: (v: boolean) => void;
  setLogsOpen: (v: boolean) => void;
  setProjectsOpen: (v: boolean) => void;
  editFile: (path: string, contents: string) => void;
  log: (line: LogLine) => void;
  initApp: () => Promise<void>;
  refreshModels: (provider: ProviderId) => Promise<void>;
  loadProjects: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  startNewProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  build: (prompt: string) => Promise<void>;
  followUp: (prompt: string) => Promise<void>;
}

const KEYS_STORAGE = "codecanvas.keys.v1";

function loadKeys(): Keys {
  const base: Keys = {
    openai: "",
    anthropic: "",
    openrouter: "",
    ollamaUrl: "",
    ollamaModel: "",
    openrouterModel: "openai/gpt-4o",
    github: "",
  };
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* fresh start */
  }
  return base;
}

export const useStore = create<State>((set, get) => ({
  phase: "landing",
  keys: loadKeys(),
  models: loadModelCache(),
  modelErrors: {},
  autoRoute: true,
  manualChoice: null,
  autoReadme: true,
  prompt: "",
  chat: [],
  files: {},
  activeFile: null,
  writingFile: null,
  previewUrl: null,
  logs: [],
  logsOpen: false,
  lastChoice: null,
  error: null,
  settingsOpen: false,
  pushOpen: false,
  containerLive: false,
  projectId: null,
  projects: [],
  projectsOpen: false,

  setKeys: (patch) => {
    const keys = { ...get().keys, ...patch };
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
    set({ keys });
  },
  setAutoRoute: (autoRoute) => set({ autoRoute }),
  setManualChoice: (manualChoice) => set({ manualChoice }),
  setAutoReadme: (autoReadme) => set({ autoReadme }),
  setActiveFile: (activeFile) => set({ activeFile }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPushOpen: (pushOpen) => set({ pushOpen }),
  setLogsOpen: (logsOpen) => set({ logsOpen }),
  setProjectsOpen: (projectsOpen) => set({ projectsOpen }),

  log: (line) => set((s) => ({ logs: [...s.logs.slice(-499), line] })),

  editFile: (path, contents) => {
    set((s) => ({ files: { ...s.files, [path]: contents } }));
    if (get().containerLive) {
      writeProjectFile(path, contents).catch((e) =>
        get().log({ kind: "err", text: `write ${path}: ${e.message}` }),
      );
    }
    schedulePersist(set, get);
  },

  initApp: async () => {
    void get().loadProjects();
    const { keys } = get();
    const providers: ProviderId[] = ["openai", "anthropic", "openrouter", "ollama"];
    await Promise.allSettled(
      providers
        .filter((p) => (p === "ollama" ? keys.ollamaUrl : keys[p]))
        .map((p) => get().refreshModels(p)),
    );
  },

  refreshModels: async (provider) => {
    const { keys } = get();
    const hasKey = provider === "ollama" ? keys.ollamaUrl : keys[provider];
    if (!hasKey) {
      set((s) => ({ models: { ...s.models, [provider]: undefined } }));
      return;
    }
    try {
      const list = await fetchModels(provider, keys);
      set((s) => {
        const models = { ...s.models, [provider]: list };
        saveModelCache(models);
        return { models, modelErrors: { ...s.modelErrors, [provider]: undefined } };
      });
      // If the local model name was never set, default to the first installed one.
      if (provider === "ollama" && !get().keys.ollamaModel && list[0]) {
        get().setKeys({ ollamaModel: list[0].id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({ modelErrors: { ...s.modelErrors, [provider]: msg } }));
    }
  },

  loadProjects: async () => {
    try {
      set({ projects: await listProjectMetas() });
    } catch {
      /* IndexedDB unavailable (private mode etc.) — history just stays empty */
    }
  },

  openProject: async (id) => {
    const rec = await getProject(id);
    if (!rec) return;
    flushPersist();
    await resetContainer();
    set({
      projectId: rec.id,
      prompt: rec.prompt,
      chat: rec.chat ?? [],
      files: rec.files ?? {},
      lastChoice: rec.lastChoice ?? null,
      activeFile: pickDefaultFile(rec.files ?? {}),
      previewUrl: null,
      logs: [],
      error: null,
      projectsOpen: false,
      containerLive: false,
      writingFile: null,
    });
    if (Object.keys(rec.files ?? {}).length > 0) {
      await bootProject(set, get);
    } else {
      set({ phase: "ready" });
    }
  },

  startNewProject: async () => {
    flushPersist();
    await persistNow(set, get);
    await resetContainer();
    set({
      phase: "landing",
      prompt: "",
      chat: [],
      files: {},
      activeFile: null,
      writingFile: null,
      previewUrl: null,
      logs: [],
      lastChoice: null,
      error: null,
      containerLive: false,
      projectId: null,
      projectsOpen: false,
    });
    void get().loadProjects();
  },

  removeProject: async (id) => {
    await deleteProjectRecord(id);
    if (get().projectId === id) set({ projectId: null }); // keeps working copy; next save forks it
    await get().loadProjects();
  },

  build: async (prompt) => {
    await runAgent(prompt, true, set, get);
  },

  followUp: async (prompt) => {
    await runAgent(prompt, false, set, get);
  },
}));

type Set = (fn: Partial<State> | ((s: State) => Partial<State>)) => void;
type Get = () => State;

function pickDefaultFile(files: Record<string, string>): string | null {
  const paths = Object.keys(files);
  return paths.find((p) => p.endsWith("src/App.tsx")) ?? paths.sort()[0] ?? null;
}

// ------------------------------------------------------------- persistence

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

function schedulePersist(set: Set, get: Get) {
  flushPersist();
  persistTimer = setTimeout(() => void persistNow(set, get), 800);
}

async function persistNow(set: Set, get: Get) {
  flushPersist();
  const s = get();
  if (Object.keys(s.files).length === 0 && s.chat.length === 0) return;
  let id = s.projectId;
  if (!id) {
    id = crypto.randomUUID();
    set({ projectId: id });
  }
  const firstUser = s.chat.find((c) => c.role === "user")?.content ?? "";
  const title = (s.prompt || firstUser || "untitled").slice(0, 64);
  try {
    await upsertProject({
      id,
      title,
      prompt: s.prompt,
      chat: s.chat,
      files: s.files,
      lastChoice: s.lastChoice,
      updatedAt: Date.now(),
    });
    void get().loadProjects();
  } catch (e) {
    get().log({ kind: "err", text: `local save failed: ${e instanceof Error ? e.message : e}` });
  }
}

// ------------------------------------------------------------------- agent

function pickModel(prompt: string, get: Get): ModelChoice | null {
  const { autoRoute, manualChoice, keys, models } = get();
  if (!autoRoute && manualChoice) {
    return { provider: manualChoice.provider, model: manualChoice.model, reason: "manual selection" };
  }
  return route(prompt, keys, models);
}

async function runAgent(prompt: string, isFirstBuild: boolean, set: Set, get: Get) {
  const choice = pickModel(prompt, get);
  if (!choice) {
    set({ settingsOpen: true, error: "Add at least one provider key (or a local model URL) to build." });
    return;
  }

  const started = Date.now();
  set((s) => ({
    phase: "thinking",
    error: null,
    lastChoice: choice,
    prompt: isFirstBuild ? prompt : s.prompt,
    chat: [...s.chat, { role: "user", content: prompt }, { role: "assistant", content: "" }],
  }));
  const log = get().log;
  log({ kind: "info", text: `model: ${choice.model} (${choice.reason})` });

  const newFiles: Record<string, string> = {};
  const parser = createStreamParser({
    onNarration: (text) => {
      set((s) => {
        const chat = [...s.chat];
        const last = chat[chat.length - 1];
        chat[chat.length - 1] = { ...last, content: last.content + text };
        return { chat };
      });
    },
    onFileStart: (path) => set({ writingFile: path }),
    onFileDone: (path, contents) => {
      newFiles[path] = contents;
      set((s) => ({
        files: { ...s.files, [path]: contents },
        activeFile: path,
        writingFile: null,
      }));
      if (!isFirstBuild && get().containerLive) {
        writeProjectFile(path, contents).catch((e) =>
          log({ kind: "err", text: `write ${path}: ${e.message}` }),
        );
      }
    },
  });

  const messages: ChatMsg[] = [];
  if (!isFirstBuild) {
    messages.push({ role: "user", content: buildEditContext(get().files) });
    messages.push({ role: "assistant", content: "Understood — I have the current project files." });
  }
  messages.push({ role: "user", content: prompt });

  let usage;
  try {
    usage = await streamChat({
      provider: choice.provider,
      model: choice.model,
      system: SYSTEM_PROMPT,
      messages,
      keys: get().keys,
      onText: (t) => parser.push(t),
    });
    parser.end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ phase: isFirstBuild ? "error" : "ready", error: msg });
    log({ kind: "err", text: msg });
    return;
  }

  const receipt: BuildReceipt = {
    provider: choice.provider,
    model: choice.model,
    usage,
    costUsd: estimateCost(choice.model, usage, choice.provider === "ollama"),
    durationMs: Date.now() - started,
    fileCount: Object.keys(newFiles).length,
  };
  set((s) => {
    const chat = [...s.chat];
    chat[chat.length - 1] = { ...chat[chat.length - 1], receipt };
    return { chat };
  });

  if (!isFirstBuild) {
    set({ phase: "ready" });
    await persistNow(set, get);
    return;
  }

  if (Object.keys(newFiles).length === 0) {
    set({ phase: "error", error: "The model returned no files. Try a stronger model or rephrase." });
    await persistNow(set, get);
    return;
  }

  // Optional README pass before boot, so it ships in the first mount + push.
  if (get().autoReadme && !get().files["README.md"]) {
    try {
      log({ kind: "info", text: "generating README.md…" });
      const readmeParser = createStreamParser({
        onNarration: () => {},
        onFileStart: () => {},
        onFileDone: (path, contents) => {
          if (path === "README.md") set((s) => ({ files: { ...s.files, "README.md": contents } }));
        },
      });
      await streamChat({
        provider: choice.provider,
        model: choice.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: README_PROMPT(prompt, Object.keys(get().files)) }],
        keys: get().keys,
        onText: (t) => readmeParser.push(t),
      });
      readmeParser.end();
    } catch {
      log({ kind: "err", text: "README generation failed (non-blocking)" });
    }
  }

  await persistNow(set, get);
  await bootProject(set, get);
}

async function bootProject(set: Set, get: Get) {
  const log = get().log;
  try {
    set({ phase: "installing", logsOpen: true });
    await resetContainer();
    onServerReady((url) => {
      set({ previewUrl: url, phase: "ready", logsOpen: false });
      log({ kind: "info", text: `preview ready → ${url}` });
    });
    await mountProject(get().files);
    set({ containerLive: true });

    log({ kind: "cmd", text: "npm install" });
    const code = await runCommand("npm", ["install"], (out) => log({ kind: "out", text: out }));
    if (code !== 0) throw new Error(`npm install exited with code ${code}`);

    set({ phase: "starting" });
    log({ kind: "cmd", text: "npm run dev" });
    await startDevServer((out) => log({ kind: "out", text: out }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ phase: "error", error: msg });
    log({ kind: "err", text: msg });
  }
}
