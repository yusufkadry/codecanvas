# CodeCanvas

**Describe it. Watch it build. Own the code.**

CodeCanvas is an open-source, fully client-side AI coding agent and IDE. You describe an app, a model writes every file live in front of you, a real Node dev server runs it **inside your browser tab** (WebContainers), you hand-edit anything in a Monaco editor, and you ship it to GitHub as a new repo or a pull request.

There is no backend. No accounts. No telemetry. Your API keys and your code never touch a CodeCanvas server, because there isn't one — verify it in the network tab.

## Why this exists

Tools like this usually run your code on someone's hosted sandbox, which means subscriptions, credits, and your code on their machines. CodeCanvas moves the whole loop client-side:

- **BYOK or local** — bring an OpenAI / Anthropic / OpenRouter key, or point it at Ollama / LM Studio and pay nothing.
- **Every model your key unlocks** — model lists are fetched live from each provider's `/models` endpoint, not hardcoded. New releases show up the day they ship; local models are auto-detected from your Ollama install.
- **Auto-router** — given multiple keys, it classifies each task and picks the best model for it (heavy build → strongest model, small tweak → cheapest), ranked over your real model list so it auto-upgrades to new releases. Or pick manually from everything you have.
- **Build + Ideate modes** — Ideate strips the file protocol entirely: the model discusses, plans, and answers without emitting code, so thinking is cheap. Flip to Build when you're ready.
- **Never blocked** — ideate questions answer instantly even mid-build (parallel lane); build requests queue safely and fire when the current build lands. One build stream at a time by design: two agents writing the same files is corruption, not concurrency.
- **Compare mode** — race 2–3 models on the same prompt, read their code side by side with per-candidate receipts, and only the winner boots into the container. The safe version of parallel codegen.
- **Cost controls** — a ballpark-cost confirm before heavy builds on paid models, plus a hard per-message dollar cap that aborts the stream mid-flight if the estimate crosses it (enforceable only for models with known pricing in `src/lib/pricing.ts`).
- **Checkpoints & diffs** — every build turn snapshots the project (last 20). See exactly what changed per file (+/− line diffs) and restore any prior version in one click.
- **Import a repo** — paste a GitHub URL, its text files pull straight into the editor and container (public repos keyless; private with your PAT). Edit an existing codebase, not just greenfield.
- **Zip export** — download the whole project without touching GitHub. The zip writer is 100 dependency-free lines in this repo.
- **On-device project history** — every build (chat, files, checkpoints, model, cost) is saved to IndexedDB in your browser. Reopen a project and it re-boots instantly. Nothing is uploaded, ever.
- **Real execution** — WebContainers runs `npm install` and a live Vite dev server in-browser. The preview is the actual app, not a mock.
- **Your layout** — drag the dividers between chat, files, editor, and preview; the layout persists.
- **Ship like an engineer** — push to a new repo, or open a **pull request** against an existing one (your default branch is never touched). Every push step reports success/failure explicitly — no silent no-ops.
- **Build receipts** — token counts and estimated dollar cost per build, in the chat and in the PR body.
- **Pre-push dependency scan** — best-effort check of generated dependencies against [OSV.dev](https://osv.dev).
- **Auto-README** — every build can ship with a real README instead of an empty repo.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL, add a key (or a local model URL) under **Keys**, and describe an app.

> WebContainers require cross-origin isolation. The dev server and `vercel.json` already set the needed `COOP`/`COEP` headers — if you host elsewhere, replicate them.

### Local models (zero cost)

Run Ollama with CORS opened for the app's origin:

```bash
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

Then set the Local model URL to `http://localhost:11434/v1` and a model name (e.g. `llama3.1`). Any OpenAI-compatible server (LM Studio, etc.) works the same way.

### Deploy

Static hosting only — Vercel works out of the box (`vercel.json` carries the headers). Cloudflare Pages / Netlify work with equivalent header config.

## Trust model

- Keys live in `localStorage` and are sent **only** to the provider you configured (OpenAI, Anthropic, OpenRouter, your local server) or, for pushes, to `api.github.com`.
- Projects — chats, files, receipts — live in **IndexedDB on your device**. There is no sync, no account, no upload. Clearing site data deletes them.
- Anthropic calls use their documented browser opt-in header; OpenRouter and OpenAI are called directly.
- The GitHub token needs repo contents + pull request permissions and never goes anywhere but GitHub.
- Everything above is auditable in ~2,500 lines of TypeScript in this repo.

## Honest limitations

- **Node/JS/TS projects only.** WebContainers is a WASM Node runtime: no Python, no compiled languages, no native modules, no locally-running databases (external hosted DBs via HTTP are fine).
- **Model output quality varies.** Small local models will struggle with big multi-file builds; the auto-router exists for exactly this reason.
- **Pricing table drifts.** `src/lib/pricing.ts` is user-editable and clearly marked — verify against provider pricing.
- **WebContainers licensing.** The `@webcontainer/api` runtime is free for open-source/non-commercial use, but production **commercial** use may require a license from StackBlitz — check their terms before building a paid product on this.

## Roadmap

- **Compare mode** — run the same prompt through 2–3 models side by side with live previews, pick the winner.
- OAuth device flow for GitHub (replacing PAT paste).
- Project export as zip; import an existing repo to edit.
- Smarter router (cheap model call instead of heuristics).

## License

MIT — fork it, ship it, no strings.
