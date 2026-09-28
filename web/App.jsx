import { useEffect, useMemo, useRef, useState } from "react";
import { loadKey, saveKey } from "./storage.js";
import { applyOps } from "./ops.js";
import {
  DEFAULT_ASK_MODEL,
  DEFAULT_DISTILL_MODEL,
  MODELS,
  askLane,
  proposeDiff,
} from "./ai.js";
import {
  StalenessError,
  loadProjectConfig,
  loadSharedTree,
  loadContributions,
  checkSharedTreeSha,
  writeSharedTree,
  appendContribution,
} from "./github.js";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function useDebouncedSave(key, value, ready, enabled = true) {
  const timer = useRef(null);
  useEffect(() => {
    if (!ready || !enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveKey(key, value, false);
    }, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [key, value, ready, enabled]);
}

function MeNamePrompt({ onSubmit, roles = null, initialName = "", adminName = "", prefillRole = "" }) {
  const [name, setName] = useState(initialName);
  const requireRole = Array.isArray(roles);
  const matchedPrefill =
    requireRole && prefillRole && roles.some((r) => r.slug === prefillRole)
      ? prefillRole
      : "";
  const isAdminMatch =
    !matchedPrefill &&
    !!adminName &&
    name.trim().toLowerCase() === adminName.trim().toLowerCase();
  const [pickedRole, setPickedRole] = useState(
    requireRole ? roles[0]?.slug || "" : "",
  );
  const effectiveRole =
    matchedPrefill || (isAdminMatch ? "admin" : pickedRole);
  const valid = name.trim() && (!requireRole || effectiveRole);
  function submit() {
    if (!valid) return;
    onSubmit(requireRole ? { name: name.trim(), role: effectiveRole } : name.trim());
  }
  const prefillLabel =
    matchedPrefill && roles.find((r) => r.slug === matchedPrefill)?.name;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{initialName && !matchedPrefill ? "Pick your role" : "Welcome — sign in"}</h3>
        <p style={{ margin: "0 0 12px", color: "var(--soft)", fontSize: 13 }}>
          {matchedPrefill
            ? <>You've been invited as <strong>{prefillLabel}</strong>.</>
            : initialName
            ? "This workspace requires a role. Pick yours to continue."
            : "Used to label contributions you make."}
        </p>
        {(!initialName || matchedPrefill) && (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
            placeholder="Your name (e.g. Shikhin)"
            style={{ marginBottom: requireRole && !isAdminMatch && !matchedPrefill ? 10 : 0 }}
          />
        )}
        {requireRole && !isAdminMatch && !matchedPrefill && (
          <select
            autoFocus={!!initialName}
            value={pickedRole}
            onChange={(e) => setPickedRole(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          >
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        )}
        {requireRole && isAdminMatch && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--accent)" }}>
            ✓ Recognized as workspace admin — no role pick needed.
          </p>
        )}
        <div className="modal-actions">
          <button className="primary" disabled={!valid} onClick={submit}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function NoRolesScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="modal" style={{ textAlign: "center" }}>
        <h3>No roles defined</h3>
        <p style={{ color: "var(--soft)", fontSize: 13, margin: 0 }}>
          This workspace has no roles yet. Ask the admin to add one with{" "}
          <code>teamctx role new &lt;slug&gt;</code>.
        </p>
      </div>
    </div>
  );
}

function AddLaneModal({ onCancel, onAdd }) {
  const [name, setName] = useState("");
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New workstream</h3>
        <input
          autoFocus
          placeholder="e.g. Product"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onAdd(name.trim());
          }}
        />
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => onAdd(name.trim())}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

const SOURCE_OPTIONS = [
  { id: "human", label: "human", className: "human" },
  { id: "human+AI", label: "human+AI", className: "human-ai" },
  { id: "ai-service", label: "ai-service", className: "ai-service" },
];

function ContributeBox({ onSubmit, busy, distillModel, onDistillModelChange, models }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("human");

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSubmit({ text: t, source });
    setText("");
  }

  return (
    <div className="contribute">
      <div className="contribute-label">Distillation</div>
      <textarea
        placeholder="A decision, a result from your AI session, an agent's output, a key link…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <div className="source-tags">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`source-tag ${opt.className} ${
                source === opt.id ? "active" : ""
              }`}
              onClick={() => setSource(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="model-picker contribute-model">
          <label>model</label>
          <select
            value={distillModel}
            onChange={(e) => onDistillModelChange(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="primary"
          disabled={busy || !text.trim()}
          onClick={submit}
        >
          {busy && <span className="spinner" />}
          update context →
        </button>
      </div>
    </div>
  );
}

function flattenStatements(workstream) {
  const out = new Map();
  for (const why of workstream.whys) {
    out.set(why.id, { tier: "why", node: why });
    for (const what of why.whats) {
      out.set(what.id, { tier: "what", node: what });
      for (const how of what.hows) {
        out.set(how.id, { tier: "how", node: how });
      }
    }
  }
  return out;
}

function OpCard({ op, workstream }) {
  const flat = flattenStatements(workstream);

  if (op.type === "addWhy") {
    return (
      <div className="op-card add">
        <span className="op-badge">add why</span>
        <div className="op-text">{op.text}</div>
        <div className="op-summary">{op.summary}</div>
        {op.whats?.length > 0 && (
          <div style={{ marginTop: 8, color: "var(--soft)", fontSize: 13 }}>
            includes {op.whats.length} new what
            {op.whats.length === 1 ? "" : "s"}
            {op.whats.some((w) => w.hows?.length) ? " + nested hows" : ""}
          </div>
        )}
      </div>
    );
  }

  if (op.type === "addWhat") {
    const parent = flat.get(op.parentWhyId);
    return (
      <div className="op-card add">
        <span className="op-badge">add what</span>
        {parent && (
          <div className="op-parent">under: {parent.node.text}</div>
        )}
        <div className="op-text">{op.text}</div>
        <div className="op-summary">{op.summary}</div>
        {op.hows?.length > 0 && (
          <div style={{ marginTop: 8, color: "var(--soft)", fontSize: 13 }}>
            includes {op.hows.length} new how
            {op.hows.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    );
  }

  if (op.type === "addHow") {
    const parent = flat.get(op.parentWhatId);
    return (
      <div className="op-card add">
        <span className="op-badge">add how</span>
        {parent && (
          <div className="op-parent">under: {parent.node.text}</div>
        )}
        <div className="op-text">{op.text}</div>
        <div className="op-summary">{op.summary}</div>
      </div>
    );
  }

  if (op.type === "editStatement") {
    const target = flat.get(op.id);
    const currentText = target?.node.text;
    const unchanged = currentText === op.text;
    return (
      <div className="op-card edit">
        <span className="op-badge">
          edit {target?.tier || "statement"}
        </span>
        {target && (
          <div className="op-parent">id: {op.id.slice(0, 8)}</div>
        )}
        {unchanged ? (
          <div className="op-summary">no text change — summary updated only</div>
        ) : (
          <div className="op-diff-rows">
            <div className="op-diff-row now">
              <span className="tag">now</span>
              {currentText || <em style={{ color: "var(--faint)" }}>(missing)</em>}
            </div>
            <div className="op-diff-row proposed">
              <span className="tag">proposed</span>
              {op.text}
            </div>
          </div>
        )}
        <div className="op-summary">{op.summary}</div>
      </div>
    );
  }

  if (op.type === "deleteStatement") {
    const target = flat.get(op.id);
    return (
      <div className="op-card delete">
        <span className="op-badge">
          delete {target?.tier || "statement"}
        </span>
        <div className="op-text">{target?.node.text || `(unknown id ${op.id.slice(0, 8)})`}</div>
        <div className="op-summary">{op.summary}</div>
      </div>
    );
  }

  return null;
}

function ProposalReview({ proposal, workstream, onApprove, onReject }) {
  return (
    <div className="proposal">
      <h3>Proposed change</h3>
      <div className="summary">{proposal.summary}</div>
      <div>
        {(proposal.operations || []).map((op, i) => (
          <OpCard key={i} op={op} workstream={workstream} />
        ))}
      </div>
      <div className="proposal-actions">
        <button className="primary" onClick={onApprove}>
          approve & merge
        </button>
        <button onClick={onReject}>reject (keep logged)</button>
      </div>
    </div>
  );
}

function AskBar({ value, onChange, onAsk, busy, answer, quoted }) {
  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onAsk(value.trim());
  }
  return (
    <div>
      <form className="ask-row" onSubmit={submit}>
        <input
          placeholder="ask this workstream a question grounded in its record…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button className="primary" disabled={busy || !value.trim()}>
          {busy && <span className="spinner" />}
          ask
        </button>
      </form>
      {answer && (
        <div className="answer">
          {quoted && <div className="explain-quote">{quoted}</div>}
          {answer}
        </div>
      )}
    </div>
  );
}

function AskPanel({ open, onClose, value, onChange, onAsk, busy, answer, quoted, model, models, onModelChange }) {
  return (
    <>
      <div className={`ask-panel${open ? " open" : ""}`}>
        <div className="ask-panel-header">
          <span className="ask-panel-title">Ask</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="model-picker" style={{ fontSize: 11 }}>
              <label>model</label>
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                style={{ minWidth: 120 }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="ghost"
              onClick={onClose}
              style={{ padding: "4px 8px", fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>
        <AskBar
          value={value}
          onChange={onChange}
          onAsk={onAsk}
          busy={busy}
          answer={answer}
          quoted={quoted}
        />
      </div>
      <div
        className={`ask-backdrop${open ? " visible" : ""}`}
        onClick={onClose}
      />
    </>
  );
}

function formatTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function LogRow({ c }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`log-row${expanded ? " expanded" : ""}`}
      onClick={() => setExpanded((prev) => !prev)}
    >
      <div className="log-meta">
        <span className={`chip ${SOURCE_CHIP_FROM_TAG[c.source]}`}>
          {c.source === "tool" ? (c.toolName?.toLowerCase() ?? "tool") : c.source}
        </span>
        <span>{c.author}</span>
        <span className={`status ${c.status}`}>· {c.status}</span>
        <span style={{ marginLeft: "auto" }}>{formatTime(c.ts)}</span>
        <span className="log-chevron">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && <div className="log-body">{c.text}</div>}
    </div>
  );
}

function ContributionLog({ items }) {
  if (!items?.length) {
    return <div className="empty-state">No contributions yet.</div>;
  }
  const ordered = [...items].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
  return (
    <div className="log">
      {ordered.map((c) => (
        <LogRow key={c.id} c={c} />
      ))}
    </div>
  );
}

function ResetButton({ onReset }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      className={armed ? "danger" : "ghost"}
      onClick={() => {
        if (armed) {
          onReset();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? "tap again to confirm" : "reset data"}
    </button>
  );
}

const SOURCE_CHIP_FROM_TAG = {
  human: "human",
  "human+AI": "human-ai",
  "ai-service": "ai-service",
  tool: "tool",
};

function SourceChip({ statement, contributionsForLane }) {
  const lastId =
    statement.sourceContributionIds?.[
      statement.sourceContributionIds.length - 1
    ];
  const lastContrib = lastId
    ? contributionsForLane.find((c) => c.id === lastId)
    : null;
  const cls = lastContrib ? SOURCE_CHIP_FROM_TAG[lastContrib.source] : "";
  const title = statement.summary || "(no summary)";
  return <span className={`source-chip ${cls}`} title={title} />;
}

function StatementRow({ statement, tier, number, contributionsForLane, onExplain }) {
  return (
    <div
      className={`tree-row tier-${tier}`}
      onClick={() => onExplain(statement, tier)}
    >
      <SourceChip
        statement={statement}
        contributionsForLane={contributionsForLane}
      />
      {number && <span className="statement-number">{number}</span>}
      <div className="text">{statement.text}</div>
    </div>
  );
}

function TreeView({ workstream, contributionsForLane, onExplain }) {
  if (!workstream.whys?.length) {
    return (
      <div className="tree-empty">
        No Why statements yet. Add a contribution above and the AI will propose where to start.
      </div>
    );
  }
  return (
    <div className="tree">
      {workstream.whys.map((why, wi) => (
        <div key={why.id}>
          <StatementRow
            statement={why}
            tier="why"
            number={`${wi + 1}`}
            contributionsForLane={contributionsForLane}
            onExplain={onExplain}
          />
          {why.whats?.length > 0 && (
            <div className="tree-children">
              {why.whats.map((what, whi) => (
                <div key={what.id}>
                  <StatementRow
                    statement={what}
                    tier="what"
                    number={`${wi + 1}.${whi + 1}`}
                    contributionsForLane={contributionsForLane}
                    onExplain={onExplain}
                  />
                  {what.hows?.length > 0 && (
                    <div className="tree-children">
                      {what.hows.map((how, hi) => (
                        <StatementRow
                          key={how.id}
                          statement={how}
                          tier="how"
                          number={`${wi + 1}.${whi + 1}.${hi + 1}`}
                          contributionsForLane={contributionsForLane}
                          onExplain={onExplain}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ColumnView({ workstream, contributionsForLane, onExplain }) {
  const whys = workstream.whys || [];
  const allWhats = [];
  const allHows = [];

  whys.forEach((why, wi) => {
    (why.whats || []).forEach((what, whi) => {
      allWhats.push({ stmt: what, number: `${wi + 1}.${whi + 1}` });
      (what.hows || []).forEach((how, hi) => {
        allHows.push({ stmt: how, number: `${wi + 1}.${whi + 1}.${hi + 1}` });
      });
    });
  });

  return (
    <div className="column-view">
      <div className="col-panel">
        <div className="col-header">Why</div>
        <div className="col-body">
          {whys.length === 0 && <div className="empty-state">None yet.</div>}
          {whys.map((why, wi) => (
            <div
              key={why.id}
              className="col-item tier-why"
              onClick={() => onExplain(why, "why")}
            >
              <SourceChip statement={why} contributionsForLane={contributionsForLane} />
              <span className="statement-number">{wi + 1}</span>
              <div className="text">{why.text}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="col-panel">
        <div className="col-header">What</div>
        <div className="col-body">
          {allWhats.length === 0 && <div className="empty-state">None yet.</div>}
          {allWhats.map(({ stmt, number }) => (
            <div
              key={stmt.id}
              className="col-item tier-what"
              onClick={() => onExplain(stmt, "what")}
            >
              <SourceChip statement={stmt} contributionsForLane={contributionsForLane} />
              <span className="statement-number">{number}</span>
              <div className="text">{stmt.text}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="col-panel">
        <div className="col-header">How</div>
        <div className="col-body">
          {allHows.length === 0 && <div className="empty-state">None yet.</div>}
          {allHows.map(({ stmt, number }) => (
            <div
              key={stmt.id}
              className="col-item tier-how"
              onClick={() => onExplain(stmt, "how")}
            >
              <SourceChip statement={stmt} contributionsForLane={contributionsForLane} />
              <span className="statement-number">{number}</span>
              <div className="text">{stmt.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GithubModeChip({ repo }) {
  return (
    <span
      className="github-mode-chip"
      title={`Connected to ${repo}`}
      aria-label={`GitHub project: ${repo}`}
    >
      {repo}
    </span>
  );
}

function StalenessAlert({ onDismiss }) {
  return (
    <div className="staleness-alert" role="alert">
      <span>Context updated by a teammate — your view has been refreshed.</span>
      <button onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

function MainApp() {
  const [workstreams, setWorkstreams] = useState([]);
  const [contributions, setContributions] = useState({});
  const [me, setMe] = useState("");
  const [myRole, setMyRole] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showContextDrawer, setShowContextDrawer] = useState(false);
  const [roleDecisions, setRoleDecisions] = useState("");
  const [roleDecisionsLoading, setRoleDecisionsLoading] = useState(false);
  const [roleDecisionsError, setRoleDecisionsError] = useState("");
  const roleDecisionsRef = useRef("");
  const roleDecisionsInflight = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showAddLane, setShowAddLane] = useState(false);
  const [ready, setReady] = useState(false);
  const [githubMode, setGithubMode] = useState(false);
  const [githubConfig, setGithubConfig] = useState(null);
  const [githubSha, setGithubSha] = useState(null);
  const [stalenessAlert, setStalenessAlert] = useState(false);

  function addWorkstream(name) {
    const ws = { id: uid(), name, whys: [] };
    setWorkstreams((prev) => [...prev, ws]);
    setContributions((prev) => ({ ...prev, [ws.id]: [] }));
    setSelectedId(ws.id);
    setShowAddLane(false);
  }

  const [busy, setBusy] = useState(null); // { workstreamId, kind: "propose" | "ask" } | null
  const [error, setError] = useState("");

  const [pendingProposal, setPendingProposal] = useState(null);
  // shape: { workstreamId, contributionId, summary, operations }

  const [distillModel, setDistillModel] = useState(DEFAULT_DISTILL_MODEL);
  const [askModel, setAskModel] = useState(DEFAULT_ASK_MODEL);

  function logContribution({ wsId, text, source }) {
    const c = {
      id: uid(),
      ts: Date.now(),
      author: me,
      source,
      text,
      status: "logged",
    };
    setContributions((prev) => ({
      ...prev,
      [wsId]: [...(prev[wsId] || []), c],
    }));
    return c;
  }

  async function handleContribute({ text, source }) {
    if (!current) return;
    setError("");

    if (githubMode) {
      try {
        const currentSha = await checkSharedTreeSha();
        if (currentSha !== githubSha) {
          const [{ workstream: ws, sha }, { contributions: cs }] = await Promise.all([
            loadSharedTree(),
            loadContributions(),
          ]);
          setWorkstreams([ws]);
          setSelectedId(ws.id);
          setGithubSha(sha);
          setContributions({ [ws.id]: cs });
          setStalenessAlert(true);
          return;
        }
      } catch (err) {
        setError(`Staleness check failed: ${err.message}`);
        return;
      }
    }

    const logged = logContribution({ wsId: current.id, text, source });
    setBusy({ workstreamId: current.id, kind: "propose" });
    try {
      const proposal = await proposeDiff({
        workstream: current,
        contribution: text,
        source,
        model: distillModel,
      });
      setPendingProposal({
        workstreamId: current.id,
        contributionId: logged.id,
        summary: proposal.summary,
        operations: proposal.operations,
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function approveProposal() {
    if (!pendingProposal) return;
    const { workstreamId, contributionId, operations } = pendingProposal;

    if (githubMode) {
      setBusy({ workstreamId, kind: "propose" });
      try {
        const base = workstreams.find((w) => w.id === workstreamId);
        const newWorkstream = applyOps(base, operations, contributionId);

        const { sha: newSha } = await writeSharedTree(newWorkstream, githubSha);
        setGithubSha(newSha);

        const entry = (contributions[workstreamId] || []).find(
          (c) => c.id === contributionId,
        );
        if (entry) await appendContribution({ ...entry, status: "merged" });

        setWorkstreams((prev) =>
          prev.map((w) => (w.id === workstreamId ? newWorkstream : w)),
        );
        setContributions((prev) => ({
          ...prev,
          [workstreamId]: (prev[workstreamId] || []).map((c) =>
            c.id === contributionId ? { ...c, status: "merged" } : c,
          ),
        }));
        setPendingProposal(null);
      } catch (err) {
        if (err instanceof StalenessError) {
          setPendingProposal(null);
          const [{ workstream: ws, sha }, { contributions: cs }] = await Promise.all([
            loadSharedTree(),
            loadContributions(),
          ]);
          setWorkstreams([ws]);
          setSelectedId(ws.id);
          setGithubSha(sha);
          setContributions({ [ws.id]: cs });
          setStalenessAlert(true);
        } else {
          setError(err.message || String(err));
        }
      } finally {
        setBusy(null);
      }
      return;
    }

    setWorkstreams((prev) =>
      prev.map((w) =>
        w.id === workstreamId ? applyOps(w, operations, contributionId) : w,
      ),
    );
    setContributions((prev) => ({
      ...prev,
      [workstreamId]: (prev[workstreamId] || []).map((c) =>
        c.id === contributionId ? { ...c, status: "merged" } : c,
      ),
    }));
    setPendingProposal(null);
  }

  function rejectProposal() {
    setPendingProposal(null);
  }

  const [answer, setAnswer] = useState("");
  const [askInput, setAskInput] = useState("");
  const [askQuoted, setAskQuoted] = useState("");
  const [viewMode, setViewMode] = useState("column");
  const [askOpen, setAskOpen] = useState(false);

  async function handleAsk(q, opts = {}) {
    if (!current) return;
    setError("");
    setAnswer("");
    if (!opts.keepQuote) setAskQuoted("");
    setBusy({ workstreamId: current.id, kind: "ask" });
    try {
      const out = await askLane({
        workstream: current,
        question: q,
        model: askModel,
      });
      setAnswer(out);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }

  function handleExplain(statement, tier) {
    const q = `Tell me more about this ${tier}: "${statement.text}".`;
    setAskInput(q);
    setAskQuoted(`Re: ${tier} — "${statement.text}"`);
    setAskOpen(true);
    handleAsk(q, { keepQuote: true });
  }

  function openAskEmpty() {
    setAskInput("");
    setAnswer("");
    setAskQuoted("");
    setAskOpen(true);
  }

  function resetAll() {
    saveKey("tc.v2:workstreams", [], false);
    saveKey("tc.v2:contributions", {}, false);
    setWorkstreams([]);
    setContributions({});
    setSelectedId(null);
    setPendingProposal(null);
    setAnswer("");
    setError("");
    setAskInput("");
    setAskQuoted("");
    setAskOpen(false);
    setViewMode("column");
    // me stays — don't re-prompt for name on reset
  }

  useEffect(() => {
    (async () => {
      let isGithubMode = false;
      try {
        const config = await loadProjectConfig();
        setGithubConfig(config);
        setGithubMode(true);
        isGithubMode = true;
      } catch (err) {
        if (err.status !== 404) console.warn("GitHub mode check:", err.message);
      }

      if (isGithubMode) {
        try {
          const [{ workstream, sha }, { contributions: cs }, name, role] = await Promise.all([
            loadSharedTree(),
            loadContributions(),
            loadKey("tc.v2:me", false, ""),
            loadKey("tc.v2:myRole", false, ""),
          ]);
          setWorkstreams([workstream]);
          setSelectedId(workstream.id);
          setGithubSha(sha);
          setContributions({ [workstream.id]: cs });
          setMe(name);
          setMyRole(role);
        } catch (err) {
          setError(`Failed to load project: ${err.message}`);
        }
        setReady(true);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("seed") === "statslateral") {
        const { SEED_WORKSTREAMS, SEED_CONTRIBUTIONS } = await import(
          "./seeds/statslateral.js"
        );
        const existingName = await loadKey("tc.v2:me", false, "");
        await Promise.all([
          saveKey("tc.v2:workstreams", SEED_WORKSTREAMS, false),
          saveKey("tc.v2:contributions", SEED_CONTRIBUTIONS, false),
          ...(existingName ? [] : [saveKey("tc.v2:me", "Shikhin", false)]),
        ]);
        history.replaceState(null, "", window.location.pathname);
      }
      const [ws, contribs, name] = await Promise.all([
        loadKey("tc.v2:workstreams", false, []),
        loadKey("tc.v2:contributions", false, {}),
        loadKey("tc.v2:me", false, ""),
      ]);
      setWorkstreams(ws);
      setContributions(contribs);
      setMe(name);
      setSelectedId(ws[0]?.id ?? null);
      setReady(true);
    })();
  }, []);

  useDebouncedSave("tc.v2:workstreams", workstreams, ready, !githubMode);
  useDebouncedSave("tc.v2:contributions", contributions, ready, !githubMode);
  useDebouncedSave("tc.v2:me", me, ready);
  useDebouncedSave("tc.v2:myRole", myRole, ready);

  useEffect(() => {
    roleDecisionsRef.current = "";
    roleDecisionsInflight.current = null;
    setRoleDecisions("");
    setRoleDecisionsError("");
  }, [myRole]);

  async function loadRoleDecisions() {
    if (!myRole || myRole === "admin") return "";
    if (roleDecisionsRef.current) return roleDecisionsRef.current;
    if (roleDecisionsInflight.current) return roleDecisionsInflight.current;
    setRoleDecisionsLoading(true);
    setRoleDecisionsError("");
    roleDecisionsInflight.current = (async () => {
      try {
        const res = await fetch("/api/role-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: myRole }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const md = data.md || "";
        roleDecisionsRef.current = md;
        setRoleDecisions(md);
        return md;
      } catch (err) {
        setRoleDecisionsError(err.message || "Failed to load decisions.");
        return "";
      } finally {
        setRoleDecisionsLoading(false);
        roleDecisionsInflight.current = null;
      }
    })();
    return roleDecisionsInflight.current;
  }

  const myRoleDetails =
    githubMode && myRole && myRole !== "admin"
      ? githubConfig?.roles?.find((r) => r.slug === myRole)?.details || ""
      : "";

  useEffect(() => {
    if (ready && me && myRole && window.location.pathname !== "/") {
      history.replaceState(null, "", "/");
    }
  }, [ready, me, myRole]);

  const current = useMemo(
    () => workstreams.find((w) => w.id === selectedId) || null,
    [workstreams, selectedId],
  );

  if (!ready) {
    return <div style={{ padding: 40, color: "var(--soft)" }}>Loading…</div>;
  }

  if (githubMode) {
    const roles = githubConfig?.roles || [];
    if (roles.length === 0) return <NoRolesScreen />;
    const adminName = githubConfig?.me || "";
    const urlSlug = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const prefillRole = roles.some((r) => r.slug === urlSlug) ? urlSlug : "";
    function clearUrlSlug() {
      if (window.location.pathname !== "/") {
        history.replaceState(null, "", "/");
      }
    }
    if (!me) {
      return (
        <MeNamePrompt
          roles={roles}
          adminName={adminName}
          prefillRole={prefillRole}
          onSubmit={({ name, role }) => {
            setMe(name);
            setMyRole(role);
            clearUrlSlug();
          }}
        />
      );
    }
    if (!myRole) {
      return (
        <MeNamePrompt
          roles={roles}
          adminName={adminName}
          initialName={me}
          prefillRole={prefillRole}
          onSubmit={({ role }) => { setMyRole(role); clearUrlSlug(); }}
        />
      );
    }
  } else if (!me) {
    return <MeNamePrompt onSubmit={(n) => setMe(n)} />;
  }

  return (
    <div className="app">
      {stalenessAlert && (
        <StalenessAlert onDismiss={() => setStalenessAlert(false)} />
      )}
      <header className="top">
        <h1>
          Team Context <span className="dim">— shared distillation</span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {githubMode && githubConfig && (
            <GithubModeChip repo={githubConfig.name} />
          )}
          {current && (
            <button className="primary ask-header-btn" onClick={openAskEmpty}>
              Ask
            </button>
          )}
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>Workstreams</span>
          </div>
          <div className="sidebar-list">
            {workstreams.length === 0 && (
              <div className="empty-state" style={{ padding: "0 10px" }}>
                Add a workstream to begin.
              </div>
            )}
            {workstreams.map((w) => {
              const list = contributions[w.id] || [];
              const merged = list.filter((c) => c.status === "merged").length;
              const members = [...new Set(list.map((c) => c.author).filter(Boolean))];
              return (
                <div
                  key={w.id}
                  className={`ws-item ${w.id === selectedId ? "active" : ""}`}
                  onClick={() => {
                    setSelectedId(w.id);
                    setAnswer("");
                    setError("");
                    setAskInput("");
                    setAskQuoted("");
                    setPendingProposal(null);
                    setBusy(null);
                    setViewMode("column");
                    setAskOpen(false);
                  }}
                >
                  <div className="ws-item-row">
                    <span>{w.name}</span>
                    <span className="counts">
                      {merged}·{list.length}
                    </span>
                  </div>
                  {members.length > 0 && (
                    <div className="ws-item-team">
                      {members.map((name) => (
                        <span key={name} className="team-chip">{name}</span>
                      ))}
                    </div>
                  )}
                  {w.id === selectedId && githubMode && myRole && myRole !== "admin" && (
                    <ContextCopyRow onOpen={() => setShowContextDrawer(true)} />
                  )}
                </div>
              );
            })}
            {!githubMode && (
              <button className="add-ws ghost" onClick={() => setShowAddLane(true)}>
                + add workstream
              </button>
            )}
          </div>
          <div className="sidebar-integrations">
            <div className="sidebar-integrations-label">
              Context pulled from (Integrations)
            </div>
            <div className="sidebar-integrations-grid">
              {[
                { slug: "slack", name: "Slack", color: "4A154B" },
                { slug: "googledrive", name: "Google Drive", color: "4285F4" },
                { slug: "microsoftonedrive", name: "OneDrive", color: "0078D4" },
                { slug: "dropbox", name: "Dropbox", color: "0061FF" },
                { slug: "notion", name: "Notion", color: "000000" },
                { slug: "microsoftteams", name: "Microsoft Teams", color: "6264A7" },
              ].map((i) => (
                <div key={i.slug} className="integration-tile" title={i.name}>
                  <img
                    src={`https://api.iconify.design/simple-icons:${i.slug}.svg?color=%23${i.color}`}
                    alt={i.name}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="sidebar-footer-label">Settings</div>
            <div className="sidebar-footer-row">
              <span className="sidebar-me">
                signed in as {me}
                {githubMode && myRole === "admin" && (
                  <span className="admin-tag"> · Admin</span>
                )}
              </span>
              {!githubMode && <ResetButton onReset={resetAll} />}
            </div>
            {githubMode && myRole && myRole !== "admin" && (
              <button
                className="ghost role-link"
                onClick={() => setShowRoleModal(true)}
              >
                Your role ·{" "}
                {githubConfig?.roles?.find((r) => r.slug === myRole)?.name || myRole}
              </button>
            )}
          </div>
        </aside>
        <main className="workstream">
          {current ? (
            <>
              {(() => {
                const list = contributions[current.id] || [];
                const merged = list.filter((c) => c.status === "merged").length;
                return (
                  <div className="ws-title">
                    <h2>{current.name}</h2>
                    <span className="counts">
                      {merged} merged · {list.length} total
                    </span>
                  </div>
                );
              })()}
              {pendingProposal && pendingProposal.workstreamId === current.id ? (
                <section className="block">
                  <ProposalReview
                    proposal={pendingProposal}
                    workstream={current}
                    onApprove={approveProposal}
                    onReject={rejectProposal}
                  />
                </section>
              ) : (
                <section className="block">
                  <ContributeBox
                    onSubmit={handleContribute}
                    busy={busy?.kind === "propose" && busy?.workstreamId === current.id}
                    distillModel={distillModel}
                    onDistillModelChange={setDistillModel}
                    models={MODELS}
                  />
                  {error && <div className="error">Error: {error}</div>}
                </section>
              )}
              <section className="block">
                <div className="view-toggle-bar">
                  <span className="section-title" style={{ margin: 0 }}>Context</span>
                  <div className="view-toggle">
                    <button
                      className={viewMode === "list" ? "" : "ghost"}
                      onClick={() => setViewMode("list")}
                    >
                      ≡ list
                    </button>
                    <button
                      className={viewMode === "column" ? "" : "ghost"}
                      onClick={() => setViewMode("column")}
                    >
                      ⊞ columns
                    </button>
                  </div>
                </div>
                {viewMode === "list" ? (
                  <TreeView
                    workstream={current}
                    contributionsForLane={contributions[current.id] || []}
                    onExplain={handleExplain}
                  />
                ) : (
                  <ColumnView
                    workstream={current}
                    contributionsForLane={contributions[current.id] || []}
                    onExplain={handleExplain}
                  />
                )}
              </section>
              <section className="block">
                <h4 className="section-title">Contribution log</h4>
                <ContributionLog items={contributions[current.id] || []} />
              </section>
            </>
          ) : (
            <div className="empty-state">Select or create a workstream.</div>
          )}
        </main>
      </div>
      {showAddLane && (
        <AddLaneModal
          onCancel={() => setShowAddLane(false)}
          onAdd={addWorkstream}
        />
      )}
      <AskPanel
        open={askOpen && !!current}
        onClose={() => setAskOpen(false)}
        value={askInput}
        onChange={setAskInput}
        onAsk={handleAsk}
        busy={busy?.kind === "ask" && busy?.workstreamId === current?.id}
        answer={answer}
        quoted={askQuoted}
        model={askModel}
        models={MODELS}
        onModelChange={setAskModel}
      />
      <YourRoleDrawer
        open={showRoleModal && !!myRole}
        roleLabel={
          githubConfig?.roles?.find((r) => r.slug === myRole)?.name || myRole
        }
        details={myRoleDetails}
        decisions={roleDecisions}
        loading={roleDecisionsLoading}
        error={roleDecisionsError}
        loadDecisions={loadRoleDecisions}
        onClose={() => setShowRoleModal(false)}
      />
      <ContextDrawer
        open={showContextDrawer && githubMode && !!myRole && myRole !== "admin"}
        roleLabel={
          githubConfig?.roles?.find((r) => r.slug === myRole)?.name || myRole
        }
        md={formatContextMd(myRoleDetails, current)}
        onClose={() => setShowContextDrawer(false)}
      />

    </div>
  );
}

// ── Role MD helpers ───────────────────────────────────────────────────────────

function ContextCopyRow({ onOpen }) {
  return (
    <div className="ctx-copy" onClick={(e) => e.stopPropagation()}>
      <div className="ctx-copy-label">Bring your team context to:</div>
      <div className="ctx-copy-buttons">
        {["claude", "chatgpt", "gemini"].map((p) => (
          <button
            key={p}
            className="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {p === "claude" ? "Claude" : p === "chatgpt" ? "ChatGPT" : "Gemini"}
          </button>
        ))}
      </div>
    </div>
  );
}

// Assemble role details + the live Why/What/How tree as portable markdown.
function formatContextMd(details, workstream) {
  const lines = [];
  if (details && details.trim()) {
    lines.push(details.trim(), "");
  }
  if (workstream) {
    lines.push(`## Current context — ${workstream.name}`, "");
    for (const why of workstream.whys || []) {
      lines.push(`**${why.text}**`, "");
      for (const what of why.whats || []) {
        lines.push(`- ${what.text}`);
        for (const how of what.hows || []) {
          lines.push(`  - ${how.text}`);
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}

function cleanRoleMd(md) {
  if (!md) return md;
  let out = md;
  const firstH2 = out.indexOf("\n## ");
  if (firstH2 > 0) out = out.slice(firstH2 + 1);
  out = out.replace(/\n+## How to Use This File[\s\S]*$/m, "\n");
  return out.trim() + "\n";
}

// ── Inline markdown renderer ──────────────────────────────────────────────────

function renderInline(text) {
  const matches = [...text.matchAll(/(\*\*(.+?)\*\*|\*(.+?)\*)/g)];
  if (!matches.length) return text;
  const parts = [];
  let last = 0;
  for (const m of matches) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>);
    else parts.push(<em key={m.index}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMd(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      out.push(<h1 key={i} style={{ fontFamily: "var(--font-serif)", fontSize: 22, margin: "0 0 4px" }}>{renderInline(line.slice(2))}</h1>);
      i++;
    } else if (line.startsWith("## ")) {
      out.push(<h2 key={i} className="section-title" style={{ marginTop: 20 }}>{line.slice(3)}</h2>);
      i++;
    } else if (/^(\s*)- /.test(line)) {
      const items = [];
      while (i < lines.length && /^(\s*)- /.test(lines[i])) {
        const match = lines[i].match(/^(\s*)- (.*)/);
        items.push(
          <li key={i} style={{ marginLeft: match[1].length * 12, marginBottom: 4 }}>
            {renderInline(match[2])}
          </li>
        );
        i++;
      }
      out.push(<ul key={`ul${i}`} style={{ listStyle: "disc", paddingLeft: 20, margin: "6px 0" }}>{items}</ul>);
    } else if (line.trim()) {
      out.push(<p key={i} style={{ margin: "4px 0", fontSize: 14 }}>{renderInline(line)}</p>);
      i++;
    } else {
      i++;
    }
  }
  return out;
}

// ── YourRoleDrawer ────────────────────────────────────────────────────────────

function YourRoleDrawer({ open, roleLabel, details, decisions, loading, error, loadDecisions, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) loadDecisions();
  }, [open, loadDecisions]);

  const decisionsBody = decisions
    ? decisions.replace(/^##\s*Open Decisions[^\n]*\n+/i, "").trim()
    : "";

  return (
    <>
      <div className={`role-panel${open ? " open" : ""}`}>
        <div className="role-panel-header">
          <span className="role-panel-title">Your role · {roleLabel}</span>
          <button
            className="ghost"
            onClick={onClose}
            style={{ padding: "4px 8px", fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div className="role-panel-body">
          {details ? (
            <div className="role-details">{renderMd(details)}</div>
          ) : (
            <p style={{ color: "var(--soft)" }}>No role details set in config.json.</p>
          )}
          <div className="role-decisions">
            <div className="role-decisions-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Open Decisions (Yours to Make)
              </h2>
              {loading && (
                <span className="role-decisions-status">
                  <span className="spinner" /> updating…
                </span>
              )}
            </div>
            {error && !decisionsBody && (
              <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>
            )}
            {!loading && !error && !decisionsBody && (
              <p style={{ color: "var(--soft)", fontSize: 13 }}>None currently.</p>
            )}
            {decisionsBody && <div>{renderMd(decisionsBody)}</div>}
          </div>
        </div>
      </div>
      <div
        className={`role-backdrop${open ? " visible" : ""}`}
        onClick={onClose}
      />
    </>
  );
}

// ── ContextDrawer ─────────────────────────────────────────────────────────────
// Read-only, no AI calls: shows the saved role context + live tree, with a
// single copy button to paste into Claude / ChatGPT / Gemini / any agent.

function ContextDrawer({ open, roleLabel, md, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function copy() {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className={`role-panel${open ? " open" : ""}`}>
        <div className="role-panel-header">
          <span className="role-panel-title">Your context · {roleLabel}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={copied ? "primary" : "ghost"}
              onClick={copy}
              style={{ padding: "4px 10px" }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button
              className="ghost"
              onClick={onClose}
              style={{ padding: "4px 8px", fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="role-panel-body">
          <div className="role-details">{renderMd(md)}</div>
        </div>
      </div>
      <div
        className={`role-backdrop${open ? " visible" : ""}`}
        onClick={onClose}
      />
    </>
  );
}

// ── RolePage ──────────────────────────────────────────────────────────────────

function RolePage({ slug }) {
  const [content, setContent] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [askInput, setAskInput] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [askModel, setAskModel] = useState(DEFAULT_ASK_MODEL);
  const [copied, setCopied] = useState("");
  // contribution form
  const [author, setAuthor] = useState("");
  const [contribution, setContribution] = useState("");
  const [distillModel, setDistillModel] = useState(DEFAULT_DISTILL_MODEL);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState("");
  const [proposal, setProposal] = useState(null); // { summary, operations, workstream }
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/github?action=config").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch("/api/role-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      }).then((r) => r.json()),
    ])
      .then(([config, promptData]) => {
        const r = (config.roles || []).find((x) => x.slug === slug);
        if (!r) {
          setLoadErr("Role not found.");
          setLoading(false);
          return;
        }
        setContent({
          details: r.details || "",
          decisions: promptData?.md || "",
          name: r.name,
        });
        setLoading(false);
      })
      .catch((status) => {
        setLoadErr(status === 404 ? "Role not found." : "Could not load role context.");
        setLoading(false);
      });
  }, [slug]);

  async function handlePropose() {
    if (!contribution.trim() || !author.trim()) return;
    setProposing(true);
    setProposeError("");
    setProposal(null);
    try {
      const res = await fetch("/api/role-propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, author, text: contribution, model: distillModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProposal(data); // { summary, operations, workstream }
    } catch (err) {
      setProposeError(err.message || "Something went wrong.");
    } finally {
      setProposing(false);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    setProposeError("");
    try {
      const res = await fetch("/api/role-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          operations: proposal.operations,
          author,
          text: contribution,
          model: distillModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // tree changed — refetch decisions for this role
      const decisionsRes = await fetch("/api/role-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      }).then((r) => r.json()).catch(() => ({ md: "" }));
      setContent((prev) => prev ? { ...prev, decisions: decisionsRes?.md || prev.decisions } : prev);
      setProposal(null);
      setContribution("");
    } catch (err) {
      setProposeError(err.message || "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  function copyFor(platform) {
    if (!content) return;
    const assembled = [
      "## Your Role",
      "",
      content.details,
      "",
      content.decisions || "## Open Decisions (Yours to Make)\nNone currently.",
      "",
    ].join("\n");
    navigator.clipboard.writeText(assembled);
    setCopied(platform);
    setTimeout(() => setCopied(""), 2000);
  }

  async function handleAsk() {
    if (!askInput.trim() || !content) return;
    setAskBusy(true);
    setAnswer("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: askModel,
          prompt: askInput,
          system: `You are a helpful assistant answering questions about a team member's role context. Ground your answers in the context below.\n\n## Your Role\n${content.details}\n\n${content.decisions || ""}`,
          max_tokens: 512,
        }),
      });
      const data = await res.json();
      setAnswer(data?.content?.[0]?.text ?? "No answer returned.");
    } catch {
      setAnswer("Something went wrong. Please try again.");
    } finally {
      setAskBusy(false);
    }
  }

  const card = {
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "20px 24px",
    marginBottom: 20,
  };

  if (loading)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--soft)" }}>Loading role context…</span>
      </div>
    );

  if (loadErr)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#c00" }}>{loadErr}</span>
      </div>
    );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <div style={card}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 6 }}>{content.name}</div>
        <div>{renderMd(content.details)}</div>
        <div style={{ marginTop: 18 }}>
          <h2 className="section-title" style={{ margin: "0 0 6px" }}>Open Decisions (Yours to Make)</h2>
          {content.decisions ? (
            <div>{renderMd(content.decisions.replace(/^##\s*Open Decisions[^\n]*\n+/i, "").trim())}</div>
          ) : (
            <p style={{ color: "var(--soft)", fontSize: 13 }}>None currently.</p>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
          }}
        >
          <span style={{ color: "var(--soft)", fontSize: 13 }}>Bring your team context to:</span>
          {["claude", "chatgpt", "gemini"].map((p) => (
            <button
              key={p}
              className={copied === p ? "primary" : "ghost"}
              onClick={() => copyFor(p)}
              style={{ fontSize: 13 }}
            >
              {copied === p
                ? "✓ Copied"
                : p === "claude"
                ? "Claude"
                : p === "chatgpt"
                ? "ChatGPT"
                : "Gemini"}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <h4 className="section-title">Ask about your context</h4>
        <div className="ask-row">
          <input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !askBusy && handleAsk()}
            placeholder="Ask a question about your role…"
          />
          <select value={askModel} onChange={(e) => setAskModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={handleAsk} disabled={askBusy || !askInput.trim()}>
            {askBusy ? "…" : "Ask"}
          </button>
        </div>
        {answer && <div className="answer">{answer}</div>}
      </div>

      <div style={card}>
        <h4 className="section-title">Add a contribution</h4>
        {proposal ? (
          <>
            <ProposalReview
              proposal={proposal}
              workstream={proposal.workstream}
              onApprove={handleApply}
              onReject={() => { setProposal(null); setProposeError(""); }}
            />
            {applying && <p style={{ color: "var(--soft)", fontSize: 13, marginTop: 8 }}>Saving to GitHub…</p>}
            {proposeError && <p style={{ color: "#c00", fontSize: 13, marginTop: 8 }}>{proposeError}</p>}
          </>
        ) : (
          <>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name"
              style={{ marginBottom: 8, display: "block", width: "100%" }}
            />
            <textarea
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              placeholder="What should the team know? (e.g. 'We decided to pause X because…')"
              rows={4}
              style={{ display: "block", width: "100%", resize: "vertical", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="primary"
                disabled={proposing || !contribution.trim() || !author.trim()}
                onClick={handlePropose}
              >
                {proposing && <span className="spinner" />}
                update context →
              </button>
              <div className="model-picker" style={{ fontSize: 11 }}>
                <label>model</label>
                <select value={distillModel} onChange={(e) => setDistillModel(e.target.value)}>
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </div>
            {proposeError && <p style={{ color: "#c00", fontSize: 13, marginTop: 8 }}>{proposeError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Top-level router ──────────────────────────────────────────────────────────

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onpop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onpop);
    return () => window.removeEventListener("popstate", onpop);
  }, []);
  return pathname;
}

export default function App() {
  const pathname = usePathname();
  const match = pathname.match(/^\/context\/([^/]+)$/);
  if (match) return <RolePage slug={match[1]} />;
  return <MainApp />;
}
