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
  const phaseColor = phaseColors[phase] || '#a0a0b8';
  const stats = status?.stats;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-[#f0f0f8]">Dashboard</h2>
        <Link
          to="/concepts"
          className="text-xs font-semibold px-3 py-1 rounded uppercase tracking-wider cursor-pointer hover:brightness-125 transition"
          style={{
            background: `${phaseColor}22`,
            color: phaseColor,
            border: `1px solid ${phaseColor}44`,
          }}
          title="Learn about colony phases"
        >
          {phase}
        </Link>
      </div>

      <p className="text-xs text-[#707088] mb-6 leading-relaxed max-w-xl">
        The colony decomposes your goal into a{' '}
        <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300">specification tree</Link>{' '}
        through{' '}
        <Link to="/concepts" className="text-blue-400 hover:text-blue-300">stigmergic coordination</Link>{' '}
        — AI <Link to="/agents" className="text-blue-400 hover:text-blue-300">agents</Link>{' '}
        reading signals, making local decisions, and leaving traces for others to build on.
      </p>

      {workspace.goal && (
        <div className="mb-6 text-sm text-[#a0a0b8]">
          <span className="text-[#707088]">Goal:</span> {workspace.goal}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Nodes" value={stats.total_nodes} link="/viz" hint="View tree" />
          <StatCard label="Stable" value={stats.stable_count} color="#4ade80" link="/tree-guide" hint="need ≤ 2, conf ≥ 8, conflict ≤ 1" />
          <StatCard label="Avg Confidence" value={stats.avg_confidence} color="#4ade80" link="/tree-guide" hint="0-10 implementability" />
          <StatCard label="In Conflict" value={stats.nodes_in_conflict} color={stats.nodes_in_conflict > 0 ? '#f87171' : undefined} link="/agents" hint="Detected by Scout" />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => navigate('/run')}
          className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded text-sm hover:bg-green-600/30 transition-colors"
        >
          Run Simulation
        </button>
        <button
          onClick={() => navigate('/viz')}
          className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded text-sm hover:bg-blue-600/30 transition-colors"
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
          className="px-4 py-2 bg-red-600/10 text-red-400/60 border border-red-600/20 rounded text-sm hover:bg-red-600/20 transition-colors"
        >
          Clear Workspace
        </button>
      </div>

      {/* Last run summary */}
      {lastRunSummary && (
        <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-4">
          <h3 className="text-sm font-semibold text-[#f0f0f8] mb-3">Last Run</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-[#707088]">Reason: </span>
              <span className="text-[#e0e0ec]">{lastRunSummary.reason as string}</span>
            </div>
            <div>
              <span className="text-[#707088]">Pulses: </span>
              <span className="text-[#e0e0ec]">{lastRunSummary.totalPulses as number}</span>
            </div>
            <div>
              <span className="text-[#707088]">Model: </span>
              <span className="text-[#e0e0ec]">{lastRunSummary.model as string}</span>
            </div>
          </div>
          {lastRunSummary.totalCost != null && (
            <div className="mt-2 text-xs text-[#707088]">
              Cost: {(lastRunSummary.totalCost as Record<string, number>).api_calls} API calls,{' '}
              {(lastRunSummary.totalCost as Record<string, number>).input_tokens} input tokens
            </div>
          )}
          <button
            onClick={() => navigate('/replay')}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300"
          >
            View replay →
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, link, hint }: { label: string; value: number; color?: string; link?: string; hint?: string }) {
  const navigate = useNavigate();
  return (
    <div
      className={`bg-[#1e1e32] border border-[#3a3a55] rounded p-4 ${link ? 'cursor-pointer hover:border-[#606078] transition-colors' : ''}`}
      onClick={link ? () => navigate(link) : undefined}
    >
      <div className="text-[11px] text-[#707088] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || '#e0e0ec' }}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-[#606078] mt-1">{hint}</div>}
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
    <div className="flex items-center justify-center h-full">
      <form onSubmit={handleSubmit} className="w-full max-w-lg p-8">
        <h2 className="text-xl font-bold text-[#f0f0f8] mb-2">Initialize Workspace</h2>
        <p className="text-sm text-[#8888a0] mb-6">
          Define your goal and the{' '}
          <Link to="/concepts" className="text-blue-400 hover:text-blue-300">stigmergic engine</Link>{' '}
          will decompose it into a{' '}
          <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300">specification tree</Link>{' '}
          through emergent{' '}
          <Link to="/agents" className="text-blue-400 hover:text-blue-300">agent</Link> coordination.
        </p>

        <div className="mb-4">
          <label className="block text-xs text-[#a0a0b8] uppercase tracking-wider mb-2">Goal</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Build a task management app with real-time collaboration..."
            className="w-full bg-[#1e1e32] border border-[#3a3a55] rounded px-3 py-2 text-sm text-[#e0e0ec] placeholder-[#606078] focus:outline-none focus:border-[#60a5fa] resize-none h-24"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs text-[#a0a0b8] uppercase tracking-wider mb-2">
            Context Constraints
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {contextItems.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#282845] border border-[#3a3a55] rounded text-[#e0e0ec]"
              >
                {item}
                <button
                  type="button"
                  onClick={() => setContextItems(contextItems.filter((c) => c !== item))}
                  className="text-[#707088] hover:text-red-400"
                >
                  x
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
              className="flex-1 bg-[#1e1e32] border border-[#3a3a55] rounded px-3 py-1.5 text-xs text-[#e0e0ec] placeholder-[#606078] focus:outline-none focus:border-[#60a5fa]"
            />
            <button
              type="button"
              onClick={addContext}
              className="px-3 py-1.5 text-xs bg-[#282845] border border-[#3a3a55] rounded text-[#a0a0b8] hover:text-[#e0e0ec]"
            >
              Add
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-6 text-sm text-[#a0a0b8] cursor-pointer">
          <input
            type="checkbox"
            checked={analyze}
            onChange={(e) => setAnalyze(e.target.checked)}
            className="accent-blue-500"
          />
          Analyze goal with AI (requires GEMINI_API_KEY)
        </label>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        <button
          type="submit"
          disabled={!goal.trim() || submitting}
          className="w-full py-2.5 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded font-semibold text-sm hover:bg-blue-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Initializing...' : 'Initialize'}
        </button>
      </form>
    </div>
  );
}
