import { create } from "zustand";
import type {
  BuildReceipt,
  CandidateStatus,
  ChatMsg,
  ChatStatus,
  Checkpoint,
  FileChange,
  Keys,
  LogLine,
  ModelChoice,
  ModelInfo,
  MsgMode,
  Phase,
  ProjectMeta,
  ProviderId,
} from "./types";
import { streamChat } from "./providers";
import {
  SYSTEM_PROMPT,
  IDEATE_PROMPT,
  buildEditContext,
  createStreamParser,
  ideateContext,
  toAlternating,
  README_PROMPT,
} from "./agent";
import { route, classifyTier } from "./router";
import { estimateCost, estimateTokens, fmtUsd } from "./pricing";
import { diffLines } from "./diff";
import { fetchModels, loadModelCache, saveModelCache } from "./models";
import { deleteProjectRecord, getProject, listProjectMetas, upsertProject } from "./db";
import {
  mountProject,
  onServerReady,
  removeProjectFile,
  resetContainer,
  runCommand,
  startDevServer,
  writeProjectFile,
} from "./webcontainer";

export interface ChatEntry extends ChatMsg {
  id: string;
  mode?: MsgMode;
  status?: ChatStatus;
  receipt?: BuildReceipt;
  error?: string;
  changes?: FileChange[];
  checkpointId?: string;
}

export interface Candidate {
  key: string;
  provider: ProviderId;
  model: string;
  label: string;
  files: Record<string, string>;
  narration: string;
  status: CandidateStatus;
  receipt?: BuildReceipt;
  error?: string;
}

export interface CompareRun {
  entryId: string;
  prompt: string;
  isFirstBuild: boolean;
  filesBefore: Record<string, string>;
  candidates: Candidate[];
  deciding: boolean;
}

interface QueuedJob {
  entryId: string;
  prompt: string;
  compare: boolean;
}

interface Prefs {
  autoRoute: boolean;
  autoReadme: boolean;
  warnHeavy: boolean;
  maxCostUsd: number | null;
  mode: MsgMode;
  compareOn: boolean;
  compareModels: { provider: ProviderId; model: string; label: string }[];
  manualChoice: { provider: ProviderId; model: string } | null;
}

interface State extends Prefs {
  phase: Phase;
  keys: Keys;
  models: Partial<Record<ProviderId, ModelInfo[]>>;
  modelErrors: Partial<Record<ProviderId, string>>;
  prompt: string;
  chat: ChatEntry[];
  files: Record<string, string>;
  checkpoints: Checkpoint[];
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
  buildBusy: boolean;
  buildQueue: QueuedJob[];
  compare: CompareRun | null;

  setKeys: (k: Partial<Keys>) => void;
  setPref: (p: Partial<Prefs>) => void;
  toggleCompareModel: (c: { provider: ProviderId; model: string; label: string }) => void;
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
  restoreCheckpoint: (id: string) => Promise<void>;
  adoptImportedRepo: (files: Record<string, string>, name: string) => Promise<void>;
  pickWinner: (key: string) => Promise<void>;
  discardCompare: () => void;
  dispatch: (prompt: string) => void;
}

const KEYS_STORAGE = "codecanvas.keys.v1";
const PREFS_STORAGE = "codecanvas.prefs.v1";

const uid = () => crypto.randomUUID();

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

function loadPrefs(): Prefs {
  const base: Prefs = {
    autoRoute: true,
    autoReadme: true,
    warnHeavy: true,
    maxCostUsd: null,
    mode: "build",
    compareOn: false,
    compareModels: [],
    manualChoice: null,
  };
  try {
    const raw = localStorage.getItem(PREFS_STORAGE);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* defaults */
  }
  return base;
}

export const useStore = create<State>((set, get) => ({
  ...loadPrefs(),
  phase: "landing",
  keys: loadKeys(),
  models: loadModelCache(),
  modelErrors: {},
  prompt: "",
  chat: [],
  files: {},
  checkpoints: [],
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
  buildBusy: false,
  buildQueue: [],
  compare: null,

  setKeys: (patch) => {
    const keys = { ...get().keys, ...patch };
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
    set({ keys });
  },

  setPref: (p) => {
    set(p);
    savePrefs(get());
  },

  toggleCompareModel: (c) => {
    const cur = get().compareModels;
    const exists = cur.some((m) => m.provider === c.provider && m.model === c.model);
    const next = exists
      ? cur.filter((m) => !(m.provider === c.provider && m.model === c.model))
      : cur.length >= 3
        ? cur
        : [...cur, c];
    set({ compareModels: next });
    savePrefs(get());
  },

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
      /* IndexedDB unavailable — history stays empty */
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
      checkpoints: rec.checkpoints ?? [],
      lastChoice: rec.lastChoice ?? null,
      activeFile: pickDefaultFile(rec.files ?? {}),
      previewUrl: null,
      logs: [],
      error: null,
      projectsOpen: false,
      containerLive: false,
      writingFile: null,
      buildBusy: false,
      buildQueue: [],
      compare: null,
    });
    if (Object.keys(rec.files ?? {}).length > 0) await bootProject(set, get);
    else set({ phase: "ready" });
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
      checkpoints: [],
      activeFile: null,
      writingFile: null,
      previewUrl: null,
      logs: [],
      lastChoice: null,
      error: null,
      containerLive: false,
      projectId: null,
      projectsOpen: false,
      buildBusy: false,
      buildQueue: [],
      compare: null,
    });
    void get().loadProjects();
  },

  removeProject: async (id) => {
    await deleteProjectRecord(id);
    if (get().projectId === id) set({ projectId: null });
    await get().loadProjects();
  },

  restoreCheckpoint: async (id) => {
    const cp = get().checkpoints.find((c) => c.id === id);
    if (!cp) return;
    const current = get().files;
    const pkgChanged = current["package.json"] !== cp.files["package.json"];
    set({
      files: { ...cp.files },
      activeFile: pickDefaultFile(cp.files),
      chat: [
        ...get().chat,
        {
          id: uid(),
          role: "assistant",
          content: `Restored checkpoint: "${cp.label}"`,
          status: "done",
          mode: "build",
        },
      ],
    });
    if (get().containerLive && !pkgChanged) {
      for (const [path, contents] of Object.entries(cp.files)) {
        await writeProjectFile(path, contents).catch(() => {});
      }
      for (const path of Object.keys(current)) {
        if (!(path in cp.files)) await removeProjectFile(path).catch(() => {});
      }
    } else if (Object.keys(cp.files).length > 0) {
      await bootProject(set, get);
    }
    await persistNow(set, get);
  },

  adoptImportedRepo: async (files, name) => {
    flushPersist();
    await resetContainer();
    const cpId = uid();
    set({
      projectId: null,
      prompt: `Imported ${name}`,
      chat: [
        {
          id: uid(),
          role: "assistant",
          content: `Imported ${Object.keys(files).length} files from ${name}. Ask for changes in build mode, or discuss in ideate mode.`,
          status: "done",
          mode: "build",
        },
      ],
      files,
      checkpoints: [{ id: cpId, label: `imported ${name}`, at: Date.now(), files: { ...files } }],
      activeFile: pickDefaultFile(files),
      previewUrl: null,
      logs: [],
      error: null,
      containerLive: false,
      buildBusy: false,
      buildQueue: [],
      compare: null,
    });
    await persistNow(set, get);
    if (files["package.json"]) {
      await bootProject(set, get);
    } else {
      set({ phase: "ready" });
      get().log({ kind: "err", text: "no package.json — imported for editing, can't run" });
    }
  },

  pickWinner: async (key) => {
    const run = get().compare;
    if (!run) return;
    const winner = run.candidates.find((c) => c.key === key);
    if (!winner) return;
    const merged = { ...run.filesBefore, ...winner.files };
    const changes = computeChanges(run.filesBefore, winner.files);
    const cp: Checkpoint = {
      id: uid(),
      label: run.prompt.slice(0, 60),
      at: Date.now(),
      files: { ...merged },
    };
    updateEntry(set, run.entryId, {
      content: `Compared ${run.candidates.length} models — picked ${winner.label}.`,
      status: "done",
      receipt: winner.receipt,
      changes,
      checkpointId: cp.id,
    });
    set((s) => ({
      files: merged,
      checkpoints: [...s.checkpoints.slice(-19), cp],
      activeFile: pickDefaultFile(winner.files) ?? s.activeFile,
      compare: null,
      lastChoice: { provider: winner.provider, model: winner.model, reason: "compare winner" },
    }));
    await persistNow(set, get);
    if (run.isFirstBuild || !get().containerLive) {
      await bootProject(set, get);
    } else {
      for (const [path, contents] of Object.entries(winner.files)) {
        await writeProjectFile(path, contents).catch(() => {});
      }
      set({ phase: "ready" });
    }
    releaseBuildLane(set, get);
  },

  discardCompare: () => {
    const run = get().compare;
    if (!run) return;
    updateEntry(set, run.entryId, { content: "Compare discarded — no changes applied.", status: "done" });
    set({ compare: null, phase: "ready" });
    releaseBuildLane(set, get);
  },

  dispatch: (prompt) => {
    const p = prompt.trim();
    if (!p) return;
    const mode = get().mode;
    const userEntry: ChatEntry = { id: uid(), role: "user", content: p, mode };
    const asstEntry: ChatEntry = {
      id: uid(),
      role: "assistant",
      content: "",
      mode,
      status: mode === "build" && get().buildBusy ? "queued" : "streaming",
    };
    if (get().phase === "landing") {
      set({ phase: mode === "ideate" ? "ready" : "thinking" });
    }
    set((s) => ({ chat: [...s.chat, userEntry, asstEntry] }));

    if (mode === "ideate") {
      void runIdeate(p, asstEntry.id, set, get);
      return;
    }

    const compare = get().compareOn && get().compareModels.length >= 2;
    const job: QueuedJob = { entryId: asstEntry.id, prompt: p, compare };
    if (get().buildBusy) {
      set((s) => ({ buildQueue: [...s.buildQueue, job] }));
      get().log({ kind: "info", text: `queued: "${p.slice(0, 60)}"` });
      return;
    }
    void startBuildJob(job, set, get);
  },
}));

type Set = (fn: Partial<State> | ((s: State) => Partial<State>)) => void;
type Get = () => State;

function savePrefs(s: State) {
  const prefs: Prefs = {
    autoRoute: s.autoRoute,
    autoReadme: s.autoReadme,
    warnHeavy: s.warnHeavy,
    maxCostUsd: s.maxCostUsd,
    mode: s.mode,
    compareOn: s.compareOn,
    compareModels: s.compareModels,
    manualChoice: s.manualChoice,
  };
  try {
    localStorage.setItem(PREFS_STORAGE, JSON.stringify(prefs));
  } catch {
    /* non-fatal */
  }
}

function updateEntry(set: Set, id: string, patch: Partial<ChatEntry>) {
  set((s) => ({ chat: s.chat.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
}

function appendToEntry(set: Set, id: string, text: string) {
  set((s) => ({
    chat: s.chat.map((e) => (e.id === id ? { ...e, content: e.content + text } : e)),
  }));
}

function pickDefaultFile(files: Record<string, string>): string | null {
  const paths = Object.keys(files);
  return paths.find((p) => p.endsWith("src/App.tsx")) ?? paths.sort()[0] ?? null;
}

function computeChanges(
  before: Record<string, string>,
  emitted: Record<string, string>,
): FileChange[] {
  const out: FileChange[] = [];
  for (const [path, after] of Object.entries(emitted)) {
    const prev = before[path];
    if (prev === undefined) {
      out.push({ path, added: after.split("\n").length, removed: 0, isNew: true, lines: null });
    } else if (prev !== after) {
      const d = diffLines(prev, after);
      out.push({ path, added: d.added, removed: d.removed, lines: d.lines });
    }
  }
  return out;
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
    id = uid();
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
      checkpoints: s.checkpoints,
      lastChoice: s.lastChoice,
      updatedAt: Date.now(),
    });
    void get().loadProjects();
  } catch (e) {
    get().log({ kind: "err", text: `local save failed: ${e instanceof Error ? e.message : e}` });
  }
}

// --------------------------------------------------------------- model pick

function pickModel(prompt: string, get: Get): ModelChoice | null {
  const { autoRoute, manualChoice, keys, models } = get();
  if (!autoRoute && manualChoice) {
    return { provider: manualChoice.provider, model: manualChoice.model, reason: "manual selection" };
  }
  return route(prompt, keys, models);
}

// ------------------------------------------------------------ cost controls

const HEAVY_OUT_TOKENS: [number, number] = [6000, 15000];

function heavyWarningOk(prompt: string, choice: ModelChoice, get: Get): boolean {
  if (!get().warnHeavy) return true;
  if (choice.provider === "ollama") return true;
  if (classifyTier(prompt) !== "heavy") return true;
  const inTok = estimateTokens(prompt) + 600; // system prompt ballpark
  const lo = estimateCost(
    choice.model,
    { inputTokens: inTok, outputTokens: HEAVY_OUT_TOKENS[0], estimated: true },
    false,
  );
  const hi = estimateCost(
    choice.model,
    { inputTokens: inTok, outputTokens: HEAVY_OUT_TOKENS[1], estimated: true },
    false,
  );
  const range =
    lo !== null && hi !== null ? `${fmtUsd(lo)}–${fmtUsd(hi)}` : "pricing unknown for this model";
  return window.confirm(
    `Heavy build routed to ${choice.model}.\nBallpark cost: ${range}.\n\nContinue?`,
  );
}

interface CapGuard {
  controller: AbortController;
  onChunk: (t: string) => void;
  hit: () => boolean;
}

function makeCapGuard(choice: ModelChoice, inputText: string, get: Get): CapGuard {
  const controller = new AbortController();
  const inTok = estimateTokens(inputText);
  let outChars = 0;
  let hit = false;
  const onChunk = (t: string) => {
    outChars += t.length;
    const cap = get().maxCostUsd;
    if (cap === null || hit) return;
    const est = estimateCost(
      choice.model,
      { inputTokens: inTok, outputTokens: Math.ceil(outChars / 4), estimated: true },
      choice.provider === "ollama",
    );
    if (est !== null && est > cap) {
      hit = true;
      controller.abort();
    }
  };
  return { controller, onChunk, hit: () => hit };
}

// ------------------------------------------------------------------ ideate

async function runIdeate(prompt: string, entryId: string, set: Set, get: Get) {
  const choice = pickModel(prompt, get);
  if (!choice) {
    updateEntry(set, entryId, {
      status: "error",
      error: "Add a provider key first.",
      content: "No provider configured — open Keys and add one.",
    });
    set({ settingsOpen: true });
    return;
  }
  const started = Date.now();
  get().log({ kind: "info", text: `ideate: ${choice.model}` });

  const history = get()
    .chat.filter((e) => e.id !== entryId && e.content.trim() && e.status !== "queued")
    .slice(-8)
    .map((e) => ({ role: e.role, content: e.content.slice(0, 1500) }));
  const messages: ChatMsg[] = toAlternating([
    { role: "user", content: ideateContext(Object.keys(get().files)) },
    { role: "assistant", content: "Got it." },
    ...history,
    { role: "user", content: prompt },
  ]);

  const guard = makeCapGuard(choice, IDEATE_PROMPT + messages.map((m) => m.content).join(""), get);
  try {
    const usage = await streamChat({
      provider: choice.provider,
      model: choice.model,
      system: IDEATE_PROMPT,
      messages,
      keys: get().keys,
      signal: guard.controller.signal,
      onText: (t) => {
        guard.onChunk(t);
        appendToEntry(set, entryId, t);
      },
    });
    updateEntry(set, entryId, {
      status: "done",
      receipt: {
        provider: choice.provider,
        model: choice.model,
        usage,
        costUsd: estimateCost(choice.model, usage, choice.provider === "ollama"),
        durationMs: Date.now() - started,
        fileCount: 0,
      },
    });
  } catch (e) {
    if (guard.hit()) {
      updateEntry(set, entryId, {
        status: "aborted",
        error: `stopped at your ${fmtUsd(get().maxCostUsd)} cost cap`,
      });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      updateEntry(set, entryId, { status: "error", error: msg });
      get().log({ kind: "err", text: msg });
    }
  }
  schedulePersist(set, get);
}

// ------------------------------------------------------------- build lane

function releaseBuildLane(set: Set, get: Get) {
  const next = get().buildQueue[0];
  if (next) {
    set((s) => ({ buildQueue: s.buildQueue.slice(1) }));
    void startBuildJob(next, set, get);
  } else {
    set({ buildBusy: false });
  }
}

async function startBuildJob(job: QueuedJob, set: Set, get: Get) {
  set({ buildBusy: true });
  updateEntry(set, job.entryId, { status: "streaming" });
  if (job.compare) {
    await runCompare(job, set, get);
    // lane released by pickWinner/discardCompare
    return;
  }
  try {
    await runBuild(job, set, get);
  } finally {
    releaseBuildLane(set, get);
  }
}

async function runBuild(job: QueuedJob, set: Set, get: Get) {
  const { prompt, entryId } = job;
  const isFirstBuild = Object.keys(get().files).length === 0;
  const choice = pickModel(prompt, get);
  if (!choice) {
    updateEntry(set, entryId, {
      status: "error",
      error: "Add a provider key first.",
      content: "No provider configured — open Keys and add one.",
    });
    set({ settingsOpen: true, phase: isFirstBuild ? "landing" : get().phase });
    return;
  }
  if (!heavyWarningOk(prompt, choice, get)) {
    updateEntry(set, entryId, { status: "done", content: "(cancelled before spending tokens)" });
    return;
  }

  const started = Date.now();
  const filesBefore = { ...get().files };
  set({ phase: "thinking", error: null, lastChoice: choice, prompt: get().prompt || prompt });
  const log = get().log;
  log({ kind: "info", text: `model: ${choice.model} (${choice.reason})` });

  const newFiles: Record<string, string> = {};
  const parser = createStreamParser({
    onNarration: (text) => appendToEntry(set, entryId, text),
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
    messages.push({ role: "user", content: buildEditContext(filesBefore) });
    messages.push({ role: "assistant", content: "Understood — I have the current project files." });
  }
  messages.push({ role: "user", content: prompt });

  const guard = makeCapGuard(choice, SYSTEM_PROMPT + messages.map((m) => m.content).join(""), get);
  let usage;
  let aborted = false;
  try {
    usage = await streamChat({
      provider: choice.provider,
      model: choice.model,
      system: SYSTEM_PROMPT,
      messages,
      keys: get().keys,
      signal: guard.controller.signal,
      onText: (t) => {
        guard.onChunk(t);
        parser.push(t);
      },
    });
    parser.end();
  } catch (e) {
    parser.end();
    if (guard.hit()) {
      aborted = true;
      usage = {
        inputTokens: estimateTokens(SYSTEM_PROMPT + messages.map((m) => m.content).join("")),
        outputTokens: 0,
        estimated: true,
      };
      updateEntry(set, entryId, {
        status: "aborted",
        error: `stopped at your ${fmtUsd(get().maxCostUsd)} cost cap — files may be incomplete`,
      });
      log({ kind: "err", text: `aborted at cost cap ${fmtUsd(get().maxCostUsd)}` });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      updateEntry(set, entryId, { status: "error", error: msg });
      set({ phase: isFirstBuild ? "error" : "ready", error: msg });
      log({ kind: "err", text: msg });
      await persistNow(set, get);
      return;
    }
  }

  const changes = computeChanges(filesBefore, newFiles);
  const cp: Checkpoint | null =
    Object.keys(newFiles).length > 0
      ? { id: uid(), label: prompt.slice(0, 60), at: Date.now(), files: { ...get().files } }
      : null;
  if (cp) set((s) => ({ checkpoints: [...s.checkpoints.slice(-19), cp] }));

  updateEntry(set, entryId, {
    status: aborted ? "aborted" : "done",
    receipt: usage
      ? {
          provider: choice.provider,
          model: choice.model,
          usage,
          costUsd: estimateCost(choice.model, usage, choice.provider === "ollama"),
          durationMs: Date.now() - started,
          fileCount: Object.keys(newFiles).length,
        }
      : undefined,
    changes,
    checkpointId: cp?.id,
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

  if (aborted) {
    set({ phase: "error", error: "Build aborted at cost cap — files may be incomplete. Edit or rebuild." });
    await persistNow(set, get);
    return;
  }

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

// ----------------------------------------------------------------- compare

async function runCompare(job: QueuedJob, set: Set, get: Get) {
  const { prompt, entryId } = job;
  const isFirstBuild = Object.keys(get().files).length === 0;
  const filesBefore = { ...get().files };
  const picks = get().compareModels.slice(0, 3);

  const candidates: Candidate[] = picks.map((p, i) => ({
    key: `${p.provider}::${p.model}::${i}`,
    provider: p.provider,
    model: p.model,
    label: p.label,
    files: {},
    narration: "",
    status: "streaming",
  }));

  set({
    phase: "comparing",
    error: null,
    compare: { entryId, prompt, isFirstBuild, filesBefore, candidates, deciding: false },
  });
  updateEntry(set, entryId, {
    content: `Comparing ${candidates.length} models — pick a winner when they finish.`,
  });
  get().log({ kind: "info", text: `compare: ${candidates.map((c) => c.model).join(" vs ")}` });

  const messages: ChatMsg[] = [];
  if (!isFirstBuild) {
    messages.push({ role: "user", content: buildEditContext(filesBefore) });
    messages.push({ role: "assistant", content: "Understood — I have the current project files." });
  }
  messages.push({ role: "user", content: prompt });

  const updateCandidate = (key: string, patch: Partial<Candidate> | ((c: Candidate) => Partial<Candidate>)) => {
    set((s) => {
      if (!s.compare) return {};
      return {
        compare: {
          ...s.compare,
          candidates: s.compare.candidates.map((c) =>
            c.key === key ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c,
          ),
        },
      };
    });
  };

  await Promise.allSettled(
    candidates.map(async (cand) => {
      const started = Date.now();
      const parser = createStreamParser({
        onNarration: (text) => updateCandidate(cand.key, (c) => ({ narration: c.narration + text })),
        onFileStart: () => {},
        onFileDone: (path, contents) =>
          updateCandidate(cand.key, (c) => ({ files: { ...c.files, [path]: contents } })),
      });
      const choice: ModelChoice = { provider: cand.provider, model: cand.model, reason: "compare" };
      const guard = makeCapGuard(choice, SYSTEM_PROMPT + messages.map((m) => m.content).join(""), get);
      try {
        const usage = await streamChat({
          provider: cand.provider,
          model: cand.model,
          system: SYSTEM_PROMPT,
          messages,
          keys: get().keys,
          signal: guard.controller.signal,
          onText: (t) => {
            guard.onChunk(t);
            parser.push(t);
          },
        });
        parser.end();
        updateCandidate(cand.key, {
          status: "done",
          receipt: {
            provider: cand.provider,
            model: cand.model,
            usage,
            costUsd: estimateCost(cand.model, usage, cand.provider === "ollama"),
            durationMs: Date.now() - started,
            fileCount: 0,
          },
        });
        updateCandidate(cand.key, (c) => ({
          receipt: c.receipt ? { ...c.receipt, fileCount: Object.keys(c.files).length } : c.receipt,
        }));
      } catch (e) {
        parser.end();
        if (guard.hit()) {
          updateCandidate(cand.key, { status: "aborted", error: "hit cost cap" });
        } else {
          updateCandidate(cand.key, {
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }),
  );

  set((s) => (s.compare ? { compare: { ...s.compare, deciding: true } } : {}));
  updateEntry(set, entryId, {
    content: `Compared ${candidates.length} models — pick a winner or discard.`,
  });
}

// -------------------------------------------------------------------- boot

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
