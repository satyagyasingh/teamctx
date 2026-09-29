import { useEffect, useMemo, useRef, useState } from "react";
import { applyOps } from "./ops.js";
import { DEFAULT_ASK_MODEL, DEFAULT_DISTILL_MODEL, MODELS } from "./ai.js";
import {
  SignedOutError,
  loadWorkspace,
  projectFromPath,
  proposeContribution,
  applyContribution,
  discardContribution,
  approveQueued,
  rejectQueued,
  markTask,
  loadProjects,
  askProject,
  loadRole,
  addExistingProject,
} from "./api.js";

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

function OpCard({ op, workstream, picked = null, onPick = null }) {
  const flat = flattenStatements(workstream);
  // The server resolves a queued operation against the tree it belongs to,
  // which the page may not be showing. Fall back to the tree in hand for a
  // proposal that has not been queued and has no such annotation.
  const was = op.was ?? flat.get(op.id)?.node.text ?? null;
  const gone = op.gone ?? (!!op.id && !flat.has(op.id));
  const wrap = (body, kind) => (onPick ? (
    <label className={`op-card ${kind}${picked ? "" : " unpicked"}`} style={{ display: "block", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        style={{ width: "auto", marginRight: 8, verticalAlign: "middle" }}
      />
      {body}
    </label>
  ) : (
    <div className={`op-card ${kind}`}>{body}</div>
  ));

  if (op.type === "addWhy") {
    return wrap(
      <>
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
      </>, "add",
    );
  }

  if (op.type === "addWhat") {
    const parent = flat.get(op.parentWhyId);
    return wrap(
      <>
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
      </>, "add",
    );
  }

  if (op.type === "addHow") {
    const parent = flat.get(op.parentWhatId);
    return wrap(
      <>
        <span className="op-badge">add how</span>
        {parent && (
          <div className="op-parent">under: {parent.node.text}</div>
        )}
        <div className="op-text">{op.text}</div>
        <div className="op-summary">{op.summary}</div>
      </>, "add",
    );
  }

  if (op.type === "editStatement") {
    const unchanged = was === op.text;
    return wrap(
      <>
        <span className="op-badge">
          edit {op.tier || flat.get(op.id)?.tier || "statement"}
        </span>
        {gone ? (
          <div className="op-gone">
            This is not in the context any more — approving it changes nothing.
          </div>
        ) : unchanged ? (
          <div className="op-summary">no text change — summary updated only</div>
        ) : (
          <div className="op-diff-rows">
            <div className="op-diff-row now">
              <span className="tag">now</span>
              {was}
            </div>
            <div className="op-diff-row proposed">
              <span className="tag">proposed</span>
              {op.text}
            </div>
          </div>
        )}
        <div className="op-summary">{op.summary}</div>
      </>, "edit",
    );
  }

  if (op.type === "deleteStatement") {
    return wrap(
      <>
        <span className="op-badge">
          remove {op.tier || flat.get(op.id)?.tier || "statement"}
        </span>
        {gone ? (
          <div className="op-gone">
            Already gone from the context — approving it changes nothing.
          </div>
        ) : (
          <div className="op-text">{was}</div>
        )}
        <div className="op-summary">{op.summary}</div>
      </>, "delete",
    );
  }

  return null;
}

/**
 * What is waiting on the manager, out of the way until it is being read.
 *
 * Every pending contribution used to be drawn open, one after another, above
 * the box for adding context — six changes deep on a busy project, so the thing
 * people came to do was below the fold. It is one line now, and opens an item at
 * a time.
 */
function PendingQueue({ items, elsewhere = 0, waiting = null, isManager = true, workstream, onApprove, onReject }) {
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState({});

  // Not yours to clear: you are told it exists and who it waits on, and no more
  // than that. Without this the queue simply was not there, which reads as work
  // having gone missing.
  if (!isManager) {
    if (!waiting?.total) return null;
    return (
      <section className="block">
        <p className="muted" style={{ margin: 0 }}>
          {waiting.total} change{waiting.total === 1 ? "" : "s"} sent for review, waiting on {waiting.managerName}.
        </p>
      </section>
    );
  }

  if (!items.length) {
    if (!elsewhere) return null;
    return (
      <section className="block">
        <p className="muted" style={{ margin: 0 }}>
          {elsewhere} change{elsewhere === 1 ? "" : "s"} waiting on you in another part of the work.
        </p>
      </section>
    );
  }
  const open = items.find((q) => q.id === openId) || null;

  const pickedFor = (q) => picked[q.id]
    ?? q.operations.map((op, i) => (op.gone ? null : i)).filter((i) => i !== null);

  return (
    <section className="block">
      <div className="view-toggle-bar">
        <span className="section-title" style={{ margin: 0 }}>
          Waiting on you · {items.length}
        </span>
        {elsewhere > 0 && (
          <span className="muted">and {elsewhere} in another part of the work</span>
        )}
      </div>
      <div className="log">
        {items.map((q) => {
          const isOpen = q.id === openId;
          const keep = pickedFor(q);
          return (
            <div key={q.id} className={`log-row${isOpen ? " expanded" : ""}`}>
              <div className="log-meta" onClick={() => setOpenId(isOpen ? null : q.id)} style={{ cursor: "pointer" }}>
                <span className="chip human">{q.operations.length} change{q.operations.length === 1 ? "" : "s"}</span>
                <span>{q.summary || "(no summary)"}</span>
                <span className="status logged">· from {q.author}</span>
                <span className="log-chevron" style={{ marginLeft: "auto" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div className="log-body">
                  {q.text && <div className="explain-quote">{q.text}</div>}
                  {q.operations.map((op, i) => (
                    <OpCard
                      key={i}
                      op={op}
                      workstream={workstream}
                      picked={keep.includes(i)}
                      onPick={() => setPicked((prev) => ({
                        ...prev,
                        [q.id]: keep.includes(i) ? keep.filter((k) => k !== i) : [...keep, i],
                      }))}
                    />
                  ))}
                  <div className="proposal-actions">
                    <button
                      className="primary"
                      disabled={keep.length === 0}
                      onClick={() => onApprove(q.id, keep.length === q.operations.length ? null : keep)}
                    >
                      {keep.length === q.operations.length
                        ? "approve all"
                        : `approve ${keep.length} of ${q.operations.length}`}
                    </button>
                    <button onClick={() => onReject(q.id)}>reject</button>
                  </div>
                  {keep.length < q.operations.length && keep.length > 0 && (
                    <p className="muted" style={{ margin: "8px 0 0" }}>
                      The rest are left behind — the person who sent this is told either way.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProposalReview({
  proposal, workstream, onApprove, onReject,
  heading = "Proposed change", approveLabel = null, rejectLabel = "reject (keep logged)",
}) {
  return (
    <div className="proposal">
      <h3>{heading}</h3>
      <div className="summary">{proposal.summary}</div>
      <div>
        {(proposal.operations || []).map((op, i) => (
          <OpCard key={i} op={op} workstream={workstream} />
        ))}
      </div>
      <div className="proposal-actions">
        <button className="primary" onClick={onApprove}>
          {approveLabel || (proposal.willQueue ? "send for review" : "approve & merge")}
        </button>
        <button onClick={onReject}>{rejectLabel}</button>
      </div>
      {proposal.willQueue && (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          This project reviews changes like these. Your manager sees it next.
        </p>
      )}
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

/**
 * What is open, and who has it.
 *
 * The interface this came from had no idea a task existed — it held statements
 * and the contributions behind them. So this is the log's own row, which
 * already knows how to hold a chip, a name and a status and open when clicked.
 */
function TaskRow({ task, mine, onToggle }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`log-row${task.status === "done" ? " expanded" : ""}`}>
      <div className="log-meta">
        <span className={`chip ${mine ? "human-ai" : "human"}`}>
          {task.status === "done" ? "done" : "open"}
        </span>
        <span>{task.title}</span>
        <span className="status logged">· {task.owner || "nobody yet"}</span>
        <button
          className="ghost"
          style={{ marginLeft: "auto", fontSize: 12, padding: "2px 8px" }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onToggle(task, task.status === "done" ? "open" : "done");
            setBusy(false);
          }}
        >
          {task.status === "done" ? "reopen" : "mark done"}
        </button>
      </div>
    </div>
  );
}

function TaskList({ tasks, me, onToggle }) {
  if (!tasks.length) return <div className="empty-state">Nothing open here.</div>;
  // Yours first: the question somebody opens this page with is what they are
  // meant to be doing, not what everyone is.
  const ordered = [...tasks].sort((a, b) => {
    const mine = (t) => (t.owner && me && t.owner.toLowerCase() === me.toLowerCase() ? 0 : 1);
    return mine(a) - mine(b) || (a.status === b.status ? 0 : a.status === "open" ? -1 : 1);
  });
  return (
    <div className="log">
      {ordered.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          mine={!!(t.owner && me && t.owner.toLowerCase() === me.toLowerCase())}
          onToggle={onToggle}
        />
      ))}
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
  const [stalenessAlert, setStalenessAlert] = useState(false);

  function addWorkstream() {
    setShowAddLane(false);
    setError("Adding a part of the work from the workspace is not wired up yet.");
  }

  const [busy, setBusy] = useState(null); // { workstreamId, kind: "propose" | "ask" } | null
  const [error, setError] = useState("");

  const [pendingProposal, setPendingProposal] = useState(null);
  // shape: { workstreamId, text, source, summary, operations, willQueue }
  const [notice, setNotice] = useState("");
  const [tasks, setTasks] = useState([]);
  const [pending, setPending] = useState([]);
  const [waiting, setWaiting] = useState(null);
  const [project, setProject] = useState(null);

  const [distillModel, setDistillModel] = useState(DEFAULT_DISTILL_MODEL);
  const [askModel, setAskModel] = useState(DEFAULT_ASK_MODEL);

  // Contributing runs teamctx's own path on the server: the review policy
  // decides whether it lands or waits, provenance is recorded, the role files
  // are regenerated. Two calls, because the person sees what the model proposed
  // before any of it is written — and the second call carries that proposal
  // back, so the model is not asked twice and what lands is what they approved.
  async function handleContribute({ text, source }) {
    if (!current) return;
    setError("");
    setBusy({ workstreamId: current.id, kind: "propose" });
    try {
      const r = await proposeContribution({ ...project, workstream: current.id, text });
      if (!r.operations.length) {
        setError("Nothing in that changed the context. It is on the record either way.");
        return;
      }
      setPendingProposal({
        workstreamId: current.id,
        text,
        source,
        summary: r.summary,
        operations: r.operations,
        willQueue: r.willQueue,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function approveProposal() {
    if (!pendingProposal) return;
    const { workstreamId, text, summary, operations } = pendingProposal;
    setBusy({ workstreamId, kind: "propose" });
    setError("");
    try {
      const r = await applyContribution({ ...project, workstream: workstreamId, text, summary, operations });
      // The server hands back what it wrote, so the page shows the repository
      // rather than a guess at what the repository now says.
      setWorkstreams((prev) =>
        prev.map((w) => (w.id === workstreamId ? { ...w, whys: r.workstream.whys || [] } : w)),
      );
      setContributions((prev) => ({ ...prev, [workstreamId]: r.contributions || prev[workstreamId] || [] }));
      setPendingProposal(null);
      if (r.queued) setNotice("Sent for review. Your manager decides when it lands.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function approveQueuedItem(id, only = null) {
    setError("");
    try {
      const r = await approveQueued({ ...project, id, only });
      setWorkstreams((prev) =>
        prev.map((w) => (w.id === r.workstream ? { ...w, whys: r.tree?.whys || w.whys } : w)),
      );
      setPending(r.pending || []);
      if (r.leftOut) setNotice(`Approved. ${r.leftOut} change${r.leftOut === 1 ? " was" : "s were"} left behind.`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function rejectQueuedItem(id) {
    setError("");
    try {
      setPending((await rejectQueued({ ...project, id })).pending || []);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function toggleTask(task, status) {
    setError("");
    try {
      const r = await markTask({ ...project, id: task.id, status });
      setTasks((prev) => prev.map((t) => (t.id === r.task.id ? r.task : t)));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function rejectProposal() {
    const discarded = pendingProposal;
    setPendingProposal(null);
    if (!discarded) return;
    // Rejected, and still said. The reading is thrown away; the contribution
    // itself stays on the record.
    try {
      const r = await discardContribution({ ...project, workstream: discarded.workstreamId, text: discarded.text });
      setContributions((prev) => ({
        ...prev,
        [discarded.workstreamId]: [...(prev[discarded.workstreamId] || []), r.contribution],
      }));
    } catch (err) {
      setError(errorText(err));
    }
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
      const { answer: out } = await askProject({
        ...project,
        workstream: current.id,
        question: q,
      });
      setAnswer(out);
    } catch (err) {
      setError(errorText(err));
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

  // The project in the address bar, and everything the person may see of it.
  //
  // What this replaces asked the visitor for a name, let them pick their own
  // role from a dropdown, and kept both in localStorage. The server answers all
  // three questions now — who you are, what your role is, what you are allowed
  // to read — because only it can answer them truthfully.
  useEffect(() => {
    (async () => {
      const opened = projectFromPath();
      setProject(opened);
      if (!opened) {
        setError("No project in this address.");
        setReady(true);
        return;
      }
      try {
        const data = await loadWorkspace(opened);
        setGithubConfig({ name: `${data.project.owner}/${data.project.repo}`, roles: data.roles });
        setGithubMode(true);
        setWorkstreams(data.workstreams);
        setContributions(data.contributions);
        setTasks(data.tasks || []);
        setPending(data.pending || []);
        setWaiting(data.waiting || null);
        setSelectedId(data.workstreams[0]?.id ?? null);
        setMe(data.me.name);
        setMyRole(data.me.role || (data.me.isManager ? "admin" : ""));
      } catch (err) {
        if (err instanceof SignedOutError) {
          window.location.href = err.signIn;
          return;
        }
        setError(err.message || String(err));
      }
      setReady(true);
    })();
  }, []);

  // Nothing here is saved in the browser. The tree lives in the repository and
  // the person is whoever the session says, so a local copy of either could only
  // ever be a stale second opinion.

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
        const { md = "" } = await loadRole({ ...project, slug: myRole });
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

  const current = useMemo(
    () => workstreams.find((w) => w.id === selectedId) || null,
    [workstreams, selectedId],
  );

  if (!ready) {
    return <div style={{ padding: 40, color: "var(--soft)" }}>Loading…</div>;
  }

  if (error && !workstreams.length) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="modal" style={{ textAlign: "center" }}>
          <h3>This project could not be opened</h3>
          <p style={{ color: "var(--soft)", fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {stalenessAlert && (
        <StalenessAlert onDismiss={() => setStalenessAlert(false)} />
      )}
      <header className="top">
        <h1>
          <a href="/projects" style={{ textDecoration: "none", color: "inherit" }}>
            ← All projects
          </a>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {githubConfig && <GithubModeChip repo={githubConfig.name} />}
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
                    setNotice("");
                    setBusy(null);
                    setViewMode("column");
                    setAskOpen(false);
                  }}
                >
                  <div className="ws-item-row">
                    <span>{w.name}</span>
                    <span className="counts">
                      {pending.filter((q) => q.workstream === w.id).length > 0
                        && `${pending.filter((q) => q.workstream === w.id).length} waiting · `}
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
                  {w.id === selectedId && myRole && myRole !== "admin" && (
                    <ContextCopyRow onOpen={() => setShowContextDrawer(true)} />
                  )}
                </div>
              );
            })}
            {myRole === "admin" && (
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
                {myRole === "admin" && <span className="admin-tag"> · Manager</span>}
              </span>
            </div>
            {myRole && myRole !== "admin" && (
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
              <PendingQueue
                items={pending.filter((q) => q.workstream === current.id)}
                elsewhere={pending.filter((q) => q.workstream !== current.id).length}
                waiting={waiting}
                isManager={myRole === "admin"}
                workstream={current}
                onApprove={approveQueuedItem}
                onReject={rejectQueuedItem}
              />
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
                  {notice && <div className="answer">{notice}</div>}
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
                <h4 className="section-title">Tasks</h4>
                <TaskList
                  tasks={tasks.filter((t) => t.workstream === current.id)}
                  me={me}
                  onToggle={toggleTask}
                />
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
        open={showContextDrawer && !!myRole && myRole !== "admin"}
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

// ── ProjectsPage ──────────────────────────────────────────────────────────────
// The standalone app was one deployment pointed at one repository, so it never
// drew a list of projects. This is the sidebar's own row, lifted into a column:
// nothing invented, and the row somebody clicks is the row they land beside.

function ProjectsPage() {
  const [state, setState] = useState({ loading: true, projects: [], me: null, error: "" });
  const [adding, setAdding] = useState(false);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadProjects();
        setState({ loading: false, projects: data.projects, me: data.me, error: "" });
      } catch (err) {
        if (err instanceof SignedOutError) {
          window.location.href = err.signIn;
          return;
        }
        setState({ loading: false, projects: [], me: null, error: err.message || String(err) });
      }
    })();
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!slug.trim()) return;
    setBusy(true);
    setState((prev) => ({ ...prev, error: "" }));
    try {
      const { project } = await addExistingProject(slug.trim());
      setState((prev) => ({
        ...prev,
        projects: [...prev.projects.filter((p) => p.slug !== project.slug), project]
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      }));
      setSlug("");
      setAdding(false);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message || String(err) }));
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) {
    return <div style={{ padding: 40, color: "var(--soft)" }}>Loading…</div>;
  }

  const canCreate = !!state.me?.canCreate;

  return (
    <div className="app">
      <header className="top">
        <h1>
          Your projects <span className="dim">— what you can open</span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {state.me && <span className="sidebar-me">signed in as {state.me.name}</span>}
          <a className="btn" href="/settings">Settings</a>
        </div>
      </header>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 20px 40px", width: "100%" }}>
        {state.error && <div className="error">Error: {state.error}</div>}

        <section className="card">
          {state.projects.length === 0 ? (
            <div className="empty-state">
              Nothing here yet. Create one, or add a project you already have.
            </div>
          ) : (
            <div className="sidebar-list">
              {state.projects.map((p) => (
                <a
                  key={p.slug}
                  className="ws-item"
                  href={`/project/${p.owner}/${p.repo}`}
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {/* What the manager called it, not the repository it sits in:
                      a list of owner/repo is a list of repositories, and nobody
                      thinks of their work that way. */}
                  <div className="ws-item-row">
                    <span>{p.name || p.repo}</span>
                  </div>
                  <div className="ws-item-team">
                    <span className="team-chip" style={{ fontFamily: "var(--font-mono)" }}>
                      {p.owner}/{p.repo}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}

          <div className="actions" style={{ marginTop: 18, gap: ".75rem", flexWrap: "wrap" }}>
            {canCreate && (
              <a className="btn" href="/settings/new-project">Create a project</a>
            )}
            <button className="ghost" onClick={() => setAdding((v) => !v)}>
              {adding ? "cancel" : "add one I already have"}
            </button>
          </div>

          {adding && (
            <form onSubmit={add} style={{ marginTop: 12 }}>
              <label htmlFor="slug">Which repository holds it?</label>
              <input
                id="slug"
                autoFocus
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="owner/repo"
              />
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Nothing is created and nothing is written. The address is remembered
                once teamctx can see the project and confirm you can read it.
              </p>
              <button className="primary" type="submit" disabled={busy || !slug.trim()}>
                {busy && <span className="spinner" />}
                add
              </button>
            </form>
          )}
        </section>

        <p className="muted" style={{ marginTop: 16 }}>
          {canCreate
            ? "Keys, access and agents are set per project, from settings."
            : "Signed in with Google: a project is created from a GitHub account, but you can open any you were invited to."}
        </p>
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
  if (pathname === "/projects") return <ProjectsPage />;
  // A page per role came over with the interface, and every endpoint it spoke
  // to belonged to the app it came from. What it showed — the role, the
  // decisions that are yours, the copy button — is in the drawer beside the
  // work, so it is not carried half-working while it waits to be rebuilt.
  return <MainApp />;
}

/** A failed call, said the way the person can act on. */
function errorText(err) {
  if (err instanceof SignedOutError) {
    window.location.href = err.signIn;
    return "Signing you back in…";
  }
  return err.message || String(err);
}
