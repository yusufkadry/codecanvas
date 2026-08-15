import { useStore } from "../lib/store";
import { manualOptions } from "../lib/router";

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const keys = useStore((s) => s.keys);
  const setKeys = useStore((s) => s.setKeys);
  const autoRoute = useStore((s) => s.autoRoute);
  const setAutoRoute = useStore((s) => s.setAutoRoute);
  const manualChoice = useStore((s) => s.manualChoice);
  const setManualChoice = useStore((s) => s.setManualChoice);
  const autoReadme = useStore((s) => s.autoReadme);
  const setAutoReadme = useStore((s) => s.setAutoReadme);
  const error = useStore((s) => s.error);

  if (!open) return null;
  const options = manualOptions(keys);

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Keys & models</h2>
          <button className="quiet-link as-button" onClick={() => setOpen(false)}>
            close
          </button>
        </div>

        <p className="trust-note">
          Keys are stored in this browser's localStorage and sent only to the provider you pick.
          There is no CodeCanvas server to send them to — check the network tab.
        </p>
        {error && <p className="modal-error">{error}</p>}

        <label className="field">
          <span>OpenAI API key</span>
          <input
            type="password"
            value={keys.openai}
            onChange={(e) => setKeys({ openai: e.target.value.trim() })}
            placeholder="sk-…"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Anthropic API key</span>
          <input
            type="password"
            value={keys.anthropic}
            onChange={(e) => setKeys({ anthropic: e.target.value.trim() })}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>OpenRouter API key</span>
          <input
            type="password"
            value={keys.openrouter}
            onChange={(e) => setKeys({ openrouter: e.target.value.trim() })}
            placeholder="sk-or-…"
            autoComplete="off"
          />
        </label>
        {keys.openrouter && (
          <label className="field">
            <span>OpenRouter model slug</span>
            <input
              value={keys.openrouterModel}
              onChange={(e) => setKeys({ openrouterModel: e.target.value.trim() })}
              placeholder="openai/gpt-4o"
            />
          </label>
        )}

        <label className="field">
          <span>Local model URL (Ollama / LM Studio, OpenAI-compatible)</span>
          <input
            value={keys.ollamaUrl}
            onChange={(e) => setKeys({ ollamaUrl: e.target.value.trim() })}
            placeholder="http://localhost:11434/v1"
          />
        </label>
        {keys.ollamaUrl && (
          <label className="field">
            <span>Local model name</span>
            <input
              value={keys.ollamaModel}
              onChange={(e) => setKeys({ ollamaModel: e.target.value.trim() })}
              placeholder="llama3.1"
            />
          </label>
        )}
        {keys.ollamaUrl && (
          <p className="field-hint">
            Ollama needs CORS opened for this origin: start it with{" "}
            <code>OLLAMA_ORIGINS={location.origin} ollama serve</code>
          </p>
        )}

        <div className="field-row">
          <label className="check">
            <input type="checkbox" checked={autoRoute} onChange={(e) => setAutoRoute(e.target.checked)} />
            <span>Auto-route: pick the best model per task from the keys above</span>
          </label>
        </div>
        {!autoRoute && (
          <label className="field">
            <span>Model</span>
            <select
              value={manualChoice ? `${manualChoice.provider}::${manualChoice.model}` : ""}
              onChange={(e) => {
                const [provider, model] = e.target.value.split("::");
                if (provider && model)
                  setManualChoice({ provider: provider as import("../lib/types").ProviderId, model });
              }}
            >
              <option value="" disabled>
                choose…
              </option>
              {options.map((o) => (
                <option key={`${o.provider}::${o.model}`} value={`${o.provider}::${o.model}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="field-row">
          <label className="check">
            <input type="checkbox" checked={autoReadme} onChange={(e) => setAutoReadme(e.target.checked)} />
            <span>Write a README.md after each build</span>
          </label>
        </div>

        <label className="field">
          <span>GitHub personal access token (for push / PRs)</span>
          <input
            type="password"
            value={keys.github}
            onChange={(e) => setKeys({ github: e.target.value.trim() })}
            placeholder="github_pat_… or ghp_…"
            autoComplete="off"
          />
        </label>
        <p className="field-hint">
          Needs repo scope. Sent only to api.github.com. Fine-grained tokens: grant "Contents:
          read/write" and "Pull requests: read/write" on the repos you'll use.
        </p>
      </div>
    </div>
  );
}
