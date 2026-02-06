import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWorkspace } from '../hooks/useWorkspace';
import { useTree } from '../hooks/useTree';
import { initWorkspace, clearWorkspace, getReplaySummary } from '../api';

const phaseColors: Record<string, string> = {
  germination: '#a78bfa',
  foraging: '#60a5fa',
  'brood-care': '#fbbf24',
  crystallization: '#4ade80',
};

export function Dashboard() {
  const { workspace, loading: wsLoading, refresh: refreshWorkspace } = useWorkspace();
  const { status, refresh: refreshTree } = useTree();
  const navigate = useNavigate();
  const [lastRunSummary, setLastRunSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (workspace?.exists) {
      getReplaySummary().then(setLastRunSummary).catch(() => {});
    }
  }, [workspace?.exists]);

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[#707088]">
        Loading...
      </div>
    );
  }

  if (!workspace?.exists) {
    return <InitForm onInit={async () => { await refreshWorkspace(); refreshTree(); }} />;
  }

  const phase = status?.phase || 'unknown';
  const phaseColor = phaseColors[phase] || '#64748b';
  const stats = status?.stats;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-2xl font-serif font-bold text-slate-900">Dashboard</h2>
        <Link
          to="/concepts"
          className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
          style={{
            color: phaseColor,
            borderColor: `${phaseColor}44`,
            backgroundColor: `${phaseColor}11`,
          }}
          title="Learn about colony phases"
        >
          {phase}
        </Link>
      </div>

      <p className="text-sm text-slate-600 mb-8 leading-relaxed max-w-xl">
        The colony decomposes your goal into a{' '}
        <Link to="/tree-guide" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">specification tree</Link>{' '}
        through{' '}
        <Link to="/concepts" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">stigmergic coordination</Link>{' '}
        — AI <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">agents</Link>{' '}
        reading signals, making local decisions, and leaving traces for others to build on.
      </p>

      {workspace.goal && (
        <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Goal</span>
          <div className="text-slate-900 font-medium">{workspace.goal}</div>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Nodes" value={stats.total_nodes} link="/viz" hint="View tree" />
          <StatCard label="Stable" value={stats.stable_count} color="#16a34a" link="/tree-guide" hint="need ≤ 2, conf ≥ 8, conflict ≤ 1" />
          <StatCard label="Avg Confidence" value={stats.avg_confidence} color="#16a34a" link="/tree-guide" hint="0-10 implementability" />
          <StatCard label="In Conflict" value={stats.nodes_in_conflict} color={stats.nodes_in_conflict > 0 ? '#dc2626' : undefined} link="/agents" hint="Detected by Scout" />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3 mb-10">
        <button
          onClick={() => navigate('/run')}
          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-md text-sm font-medium hover:bg-green-100 transition-colors"
        >
          Run Simulation
        </button>
        <button
          onClick={() => navigate('/viz')}
          className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          View Tree
        </button>
        <button
          onClick={async () => {
            if (confirm('Clear workspace? This cannot be undone.')) {
              await clearWorkspace();
              await refreshWorkspace();
            }
          }}
          className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm font-medium hover:bg-red-100 transition-colors"
        >
          Clear Workspace
        </button>
      </div>

      {/* Last run summary */}
      {lastRunSummary && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">Last Run Summary</h3>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <span className="block text-xs text-slate-500 mb-0.5">Termination</span>
              <span className="text-slate-900">{lastRunSummary.reason as string}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-0.5">Pulses</span>
              <span className="text-slate-900">{lastRunSummary.totalPulses as number}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-0.5">Model</span>
              <span className="text-slate-900 font-mono text-xs">{lastRunSummary.model as string}</span>
            </div>
          </div>
          {lastRunSummary.totalCost != null && (
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center">
              <span>
                Cost: {(lastRunSummary.totalCost as Record<string, number>).api_calls} API calls,{' '}
                {(lastRunSummary.totalCost as Record<string, number>).input_tokens} input tokens
              </span>
              <button
                onClick={() => navigate('/replay')}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                View replay →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, link, hint }: { label: string; value: number; color?: string; link?: string; hint?: string }) {
  const navigate = useNavigate();
  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg p-4 shadow-sm ${link ? 'cursor-pointer hover:border-slate-300 transition-colors' : ''}`}
      onClick={link ? () => navigate(link) : undefined}
    >
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-3xl font-light font-serif text-slate-900" style={{ color: color }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function InitForm({ onInit }: { onInit: () => void }) {
  const [goal, setGoal] = useState('');
  const [contextItems, setContextItems] = useState<string[]>(['TypeScript', 'React', 'Node.js']);
  const [newContext, setNewContext] = useState('');
  const [analyze, setAnalyze] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      await initWorkspace({ goal: goal.trim(), context: contextItems, analyze });
      onInit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize');
    } finally {
      setSubmitting(false);
    }
  };

  const addContext = () => {
    if (newContext.trim() && !contextItems.includes(newContext.trim())) {
      setContextItems([...contextItems, newContext.trim()]);
      setNewContext('');
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-lg p-8 bg-white border border-slate-200 rounded-lg shadow-sm">
        <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2">Initialize Workspace</h2>
        <p className="text-sm text-slate-600 mb-6">
          Define your goal and the{' '}
          <Link to="/concepts" className="text-blue-600 hover:text-blue-800 underline">stigmergic engine</Link>{' '}
          will decompose it into a{' '}
          <Link to="/tree-guide" className="text-blue-600 hover:text-blue-800 underline">specification tree</Link>{' '}
          through emergent{' '}
          <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline">agent</Link> coordination.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Goal</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Build a task management app with real-time collaboration..."
            className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none h-24"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Context Constraints
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {contextItems.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 border border-blue-100 rounded text-blue-700 font-medium"
              >
                {item}
                <button
                  type="button"
                  onClick={() => setContextItems(contextItems.filter((c) => c !== item))}
                  className="text-blue-400 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newContext}
              onChange={(e) => setNewContext(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContext(); } }}
              placeholder="Add constraint..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={addContext}
              className="px-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900 font-medium"
            >
              Add
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-6 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={analyze}
            onChange={(e) => setAnalyze(e.target.checked)}
            className="accent-blue-600 w-4 h-4 rounded border-slate-300"
          />
          Analyze goal with AI (requires GEMINI_API_KEY)
        </label>

        {error && <div className="text-red-500 text-sm mb-4 bg-red-50 p-2 rounded border border-red-100">{error}</div>}

        <button
          type="submit"
          disabled={!goal.trim() || submitting}
          className="w-full py-2.5 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {submitting ? 'Initializing...' : 'Initialize'}
        </button>
      </form>
    </div>
  );
}
