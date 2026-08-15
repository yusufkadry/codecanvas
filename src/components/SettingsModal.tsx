import { useStore } from "../lib/store";
import { manualGroups } from "../lib/router";
import type { ProviderId } from "../lib/types";

function ModelStatus({ provider }: { provider: ProviderId }) {
  const models = useStore((s) => s.models[provider]);
  const error = useStore((s) => s.modelErrors[provider]);
  if (error) return <p className="field-hint error-hint">couldn't fetch models: {error}</p>;
  if (models?.length) return <p className="field-hint ok-hint">{models.length} models available</p>;
  return null;
}

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const keys = useStore((s) => s.keys);
  const setKeys = useStore((s) => s.setKeys);
  const models = useStore((s) => s.models);
  const refreshModels = useStore((s) => s.refreshModels);
  const autoRoute = useStore((s) => s.autoRoute);
  const autoReadme = useStore((s) => s.autoReadme);
  const warnHeavy = useStore((s) => s.warnHeavy);
  const maxCostUsd = useStore((s) => s.maxCostUsd);
  const manualChoice = useStore((s) => s.manualChoice);
  const compareModels = useStore((s) => s.compareModels);
  const toggleCompareModel = useStore((s) => s.toggleCompareModel);
  const setPref = useStore((s) => s.setPref);
  const error = useStore((s) => s.error);

  if (!open) return null;
  const groups = manualGroups(keys, models);
  const ollamaList = models.ollama ?? [];
  const openrouterList = models.openrouter ?? [];
  const isPicked = (provider: ProviderId, model: string) =>
    compareModels.some((c) => c.provider === provider && c.model === model);

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
          Projects and chats are saved on this device (IndexedDB), never uploaded. There is no
          CodeCanvas server — check the network tab.
        </p>
        {error && <p className="modal-error">{error}</p>}

        <label className="field">
          <span>OpenAI API key</span>
          <input
            type="password"
            value={keys.openai}
            onChange={(e) => setKeys({ openai: e.target.value.trim() })}
            onBlur={() => void refreshModels("openai")}
            placeholder="sk-…"
            autoComplete="off"
          />
        </label>
        <ModelStatus provider="openai" />

        <label className="field">
          <span>Anthropic API key</span>
          <input
            type="password"
            value={keys.anthropic}
            onChange={(e) => setKeys({ anthropic: e.target.value.trim() })}
            onBlur={() => void refreshModels("anthropic")}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </label>
        <ModelStatus provider="anthropic" />

        <label className="field">
          <span>OpenRouter API key</span>
          <input
            type="password"
            value={keys.openrouter}
            onChange={(e) => setKeys({ openrouter: e.target.value.trim() })}
            onBlur={() => void refreshModels("openrouter")}
            placeholder="sk-or-…"
            autoComplete="off"
          />
        </label>
        <ModelStatus provider="openrouter" />
        {keys.openrouter && (
          <label className="field">
            <span>OpenRouter model (auto-route uses this; type to search)</span>
            <input
              list="openrouter-models"
              value={keys.openrouterModel}
              onChange={(e) => setKeys({ openrouterModel: e.target.value.trim() })}
              placeholder="openai/gpt-4o"
            />
            <datalist id="openrouter-models">
              {openrouterList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </label>
        )}

        <label className="field">
          <span>Local model URL (Ollama / LM Studio, OpenAI-compatible)</span>
          <input
            value={keys.ollamaUrl}
            onChange={(e) => setKeys({ ollamaUrl: e.target.value.trim() })}
            onBlur={() => void refreshModels("ollama")}
            placeholder="http://localhost:11434/v1"
          />
        </label>
        <ModelStatus provider="ollama" />
        {keys.ollamaUrl && (
          <label className="field">
            <span>Local model</span>
            {ollamaList.length > 0 ? (
              <select value={keys.ollamaModel} onChange={(e) => setKeys({ ollamaModel: e.target.value })}>
                {ollamaList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={keys.ollamaModel}
                onChange={(e) => setKeys({ ollamaModel: e.target.value.trim() })}
                placeholder="llama3.1"
              />
            )}
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
            <input
              type="checkbox"
              checked={autoRoute}
              onChange={(e) => setPref({ autoRoute: e.target.checked })}
            />
            <span>Auto-route: pick the best model per task from your available models</span>
          </label>
        </div>
        {!autoRoute && (
          <label className="field">
            <span>Model — everything your keys unlock</span>
            <select
              value={manualChoice ? `${manualChoice.provider}::${manualChoice.model}` : ""}
              onChange={(e) => {
                const idx = e.target.value.indexOf("::");
                if (idx === -1) return;
                const provider = e.target.value.slice(0, idx) as ProviderId;
                const model = e.target.value.slice(idx + 2);
                if (provider && model) setPref({ manualChoice: { provider, model } });
              }}
            >
              <option value="" disabled>
                choose…
              </option>
              {groups.map((g) => (
                <optgroup key={g.provider} label={g.label}>
                  {g.options.map((o) => (
                    <option key={`${g.provider}::${o.id}`} value={`${g.provider}::${o.id}`}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <div className="field-row">
          <span className="field-label-strong">Cost controls</span>
        </div>
        <div className="field-row">
          <label className="check">
            <input
              type="checkbox"
              checked={warnHeavy}
              onChange={(e) => setPref({ warnHeavy: e.target.checked })}
            />
            <span>Warn before heavy builds on paid models (shows a ballpark cost first)</span>
          </label>
        </div>
        <label className="field">
          <span>Hard cost cap per message (USD) — aborts the stream if the estimate passes it</span>
          <input
            type="number"
            min="0"
            step="0.05"
            value={maxCostUsd ?? ""}
            onChange={(e) =>
              setPref({ maxCostUsd: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
            }
            placeholder="off"
          />
        </label>
        <p className="field-hint">
          Enforced from token estimates, so only models with known pricing (see src/lib/pricing.ts)
          can trip it. Aborted builds keep whatever files already finished.
        </p>

        <div className="field-row">
          <span className="field-label-strong">Compare candidates (pick 2–3)</span>
        </div>
        <div className="compare-picker">
          {groups.length === 0 && <p className="field-hint">Add a key to pick candidates.</p>}
          {groups.map((g) => (
            <div key={g.provider} className="compare-group">
              <div className="compare-group-label">{g.label}</div>
              {g.options.slice(0, 12).map((o) => {
                const picked = isPicked(g.provider, o.id);
                return (
                  <label key={o.id} className={`check compare-check ${picked ? "picked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={!picked && compareModels.length >= 3}
                      onChange={() =>
                        toggleCompareModel({ provider: g.provider, model: o.id, label: o.label })
                      }
                    />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <p className="field-hint">
          Toggle "⇄ compare" on the input to race these on your next build and pick the winner. Each
          candidate bills its own tokens.
        </p>

        <div className="field-row">
          <label className="check">
            <input
              type="checkbox"
              checked={autoReadme}
              onChange={(e) => setPref({ autoReadme: e.target.checked })}
            />
            <span>Write a README.md after each build</span>
          </label>
        </div>

        <label className="field">
          <span>GitHub personal access token (for push / PRs / private imports)</span>
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
