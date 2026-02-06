import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getReplay, getReplaySummary } from '../api';
import type { TelemetryEvent } from '@hierophage/stigmergy';

const phaseColors: Record<string, string> = {
  germination: '#8b5cf6', // violet-500
  foraging: '#3b82f6',    // blue-500
  'brood-care': '#f59e0b', // amber-500
  crystallization: '#22c55e', // green-500
};

const actionColors: Record<string, string> = {
  DECOMPOSE: '#3b82f6',      // blue-500
  REVIEW: '#8b5cf6',         // violet-500
  UPDATE_CONTENT: '#eab308', // yellow-500
  SETTLE: '#22c55e',         // green-500
};

type ViewMode = 'timeline' | 'maintenance' | 'node';

export function Replay() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('timeline');
  const [selectedPulse, setSelectedPulse] = useState<number | null>(null);
  const [nodeFilter, setNodeFilter] = useState('');
  const [maintenanceFilter, setMaintenanceFilter] = useState<string>('all');

  useEffect(() => {
    Promise.all([getReplay(), getReplaySummary()])
      .then(([evts, sum]) => {
        setEvents(evts);
        setSummary(sum);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400">Loading...</div>;
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No telemetry data. Run the simulation first.
      </div>
    );
  }

  const pulseEvents = events.filter(
    (e): e is Extract<TelemetryEvent, { type: 'pulse' }> => e.type === 'pulse',
  );
  const maintenanceTypes = ['scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'evaporation'];
  const maintenanceEvents = events.filter((e) => maintenanceTypes.includes(e.type));

  // Total cost
  const totalCost = pulseEvents.reduce(
    (acc, p) => ({
      api_calls: acc.api_calls + p.cost.api_calls,
      input_tokens: acc.input_tokens + p.cost.input_tokens,
      output_tokens: acc.output_tokens + p.cost.output_tokens,
    }),
    { api_calls: 0, input_tokens: 0, output_tokens: 0 },
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Summary header */}
      {summary && (
        <div className="p-6 border-b border-slate-200 shrink-0 bg-white shadow-sm z-10">
          <h2 className="text-xl font-serif font-bold text-slate-900 mb-1">Replay</h2>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed max-w-2xl">
            Every mutation is logged. Browse by{' '}
            <Link to="/concepts" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">phase</Link>{' '}
            in Timeline, filter{' '}
            <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">maintenance agents</Link>{' '}
            in Maintenance, or trace a{' '}
            <Link to="/tree-guide" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">node</Link>'s full history.
          </p>
          <div className="flex gap-8 text-sm">
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Reason</span>
              <div className="text-slate-900 font-medium">{summary.reason as string}</div>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Pulses</span>
              <div className="text-slate-900 font-medium">{summary.totalPulses as number}</div>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Cost</span>
              <div className="text-slate-900 font-medium">
                {totalCost.api_calls} calls, {totalCost.input_tokens.toLocaleString()} tokens
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 px-6 pt-4 shrink-0 border-b border-slate-200 bg-white">
        {(['timeline', 'maintenance', 'node'] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors border-t border-x -mb-px relative top-px ${
              view === v
                ? 'bg-slate-50 border-slate-200 text-blue-600 border-b-transparent'
                : 'bg-white border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {v === 'timeline' ? 'Timeline' : v === 'maintenance' ? 'Maintenance' : 'Node History'}
          </button>
        ))}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50">
        {view === 'timeline' && (
          <TimelineView
            pulses={pulseEvents}
            selectedPulse={selectedPulse}
            onSelectPulse={setSelectedPulse}
          />
        )}
        {view === 'maintenance' && (
          <MaintenanceView
            events={maintenanceEvents}
            filter={maintenanceFilter}
            onFilterChange={setMaintenanceFilter}
          />
        )}
        {view === 'node' && (
          <NodeHistoryView
            events={events}
            filter={nodeFilter}
            onFilterChange={setNodeFilter}
          />
        )}
      </div>

      {/* Cost chart at bottom */}
      <div className="h-28 border-t border-slate-200 px-6 py-3 shrink-0 bg-white">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 font-semibold">
          Cumulative Cost (input tokens)
        </div>
        <CostChart pulses={pulseEvents} />
      </div>
    </div>
  );
}

function TimelineView({
  pulses,
  selectedPulse,
  onSelectPulse,
}: {
  pulses: Extract<TelemetryEvent, { type: 'pulse' }>[];
  selectedPulse: number | null;
  onSelectPulse: (n: number | null) => void;
}) {
  // Group by phase
  const groups: Array<{ phase: string; pulses: typeof pulses }> = [];
  let currentPhase = '';

  for (const p of pulses) {
    if (p.phase !== currentPhase) {
      currentPhase = p.phase;
      groups.push({ phase: currentPhase, pulses: [] });
    }
    groups[groups.length - 1].pulses.push(p);
  }

  const selected = selectedPulse !== null ? pulses.find((p) => p.pulse === selectedPulse) : null;

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 overflow-y-auto pr-2">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-8 relative pl-4 border-l border-slate-200">
            <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full border-2 border-slate-50"
                 style={{ background: phaseColors[group.phase] || '#94a3b8' }} />
            <div className="flex items-center gap-3 mb-3 -mt-1">
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: phaseColors[group.phase] || '#94a3b8' }}
              >
                {group.phase}
              </span>
              <span className="text-[10px] text-slate-400 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-100">
                {group.pulses.length} pulses
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.pulses.map((p) => (
                <button
                  key={p.pulse}
                  onClick={() => onSelectPulse(selectedPulse === p.pulse ? null : p.pulse)}
                  className={`w-6 h-6 rounded border transition-all flex items-center justify-center text-[10px] font-bold ${
                    selectedPulse === p.pulse
                      ? 'border-slate-400 shadow-md scale-110 z-10'
                      : 'border-transparent hover:border-slate-300 hover:scale-105'
                  }`}
                  style={{
                    background: selectedPulse === p.pulse ? '#fff' : (actionColors[p.action] || '#94a3b8'),
                    color: selectedPulse === p.pulse ? (actionColors[p.action] || '#94a3b8') : 'transparent',
                    borderColor: selectedPulse === p.pulse ? (actionColors[p.action] || '#94a3b8') : 'transparent'
                  }}
                  title={`#${p.pulse}: ${p.action} → ${p.target}`}
                >
                  {selectedPulse === p.pulse && p.pulse}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-96 bg-white border border-slate-200 rounded-lg p-6 shrink-0 self-start shadow-sm sticky top-0">
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <span className="text-xl font-serif font-bold text-slate-900">Pulse #{selected.pulse}</span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-bold border"
              style={{
                background: `${actionColors[selected.action] || '#94a3b8'}10`,
                borderColor: `${actionColors[selected.action] || '#94a3b8'}30`,
                color: actionColors[selected.action] || '#64748b',
              }}
            >
              {selected.action}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Target</div>
              <div className="text-sm text-slate-800 font-mono bg-slate-50 px-3 py-2 rounded border border-slate-100 break-all">
                {selected.target}
              </div>
            </div>
            {selected.reasoning && (
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Reasoning</div>
                <div className="text-sm text-slate-600 leading-relaxed italic border-l-2 border-slate-200 pl-3">
                  "{selected.reasoning}"
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Mutations</div>
                <div className="text-sm text-slate-800 font-medium">
                  {selected.mutations_succeeded} <span className="text-slate-400">/</span> {selected.mutations_attempted}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Cost</div>
                <div className="text-sm text-slate-800 font-medium">
                  {selected.cost.api_calls} calls
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">State Snapshot</div>
              <div className="text-slate-500 font-mono text-xs">
                Nodes: {selected.stats.total_nodes} &nbsp; Conf: {selected.stats.avg_confidence} &nbsp; Stable: {selected.stats.stable_count}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintenanceView({
  events,
  filter,
  onFilterChange,
}: {
  events: TelemetryEvent[];
  filter: string;
  onFilterChange: (f: string) => void;
}) {
  const types = ['all', 'scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'evaporation'];
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex gap-1.5 mb-6 flex-wrap bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onFilterChange(t)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors uppercaseTracking-wide ${
              filter === t
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {filtered.map((e, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 text-xs border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors items-center">
            <span className="text-slate-400 font-mono w-8 text-right shrink-0 select-none">
              #{('pulse' in e ? e.pulse : '?')}
            </span>
            <span className={`w-28 shrink-0 uppercase text-[10px] font-bold tracking-wider ${
              e.type === 'grazer' ? 'text-red-600' :
              e.type === 'scout' ? 'text-amber-600' :
              e.type.includes('verifier') ? 'text-green-600' :
              e.type === 'resolver' ? 'text-indigo-600' :
              'text-slate-600'
            }`}>
              {e.type.replace('_', ' ')}
            </span>
            <span className="text-slate-600 truncate flex-1 font-mono text-[11px]">
              {formatMaintenanceEvent(e)}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm italic">
            No events found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function formatMaintenanceEvent(event: TelemetryEvent): string {
  switch (event.type) {
    case 'scout': return `${event.findings.hollow.length} hollow, ${event.findings.tautologies.length} tautologies, ${event.findings.similar.length} similar → ${event.fixes} fixes`;
    case 'grazer': return `Pruned: ${event.pruned.join(', ')}`;
    case 'verifier_stability': return `${event.node}: ${event.passed ? 'PASS' : 'FAIL'}${event.reason ? ` — ${event.reason}` : ''}`;
    case 'verifier_coverage': return `${event.node}: ${event.passed ? 'COVERED' : 'GAPS'}${event.gaps?.length ? ` — ${event.gaps.join(', ')}` : ''}`;
    case 'propagation': return `${event.node}: need ${event.need_delta > 0 ? '+' : ''}${event.need_delta}, conf ${event.confidence_delta > 0 ? '+' : ''}${event.confidence_delta}`;
    case 'resolver': return `${event.node}: ${event.resolved ? 'RESOLVED' : 'unresolved'} (${event.conflict_before} → ${event.conflict_after})`;
    case 'synthesizer': return `${event.target} ← ${event.sources.join(', ')} ${event.merged ? '(merged)' : '(skipped)'}`;
    case 'evaporation': return `${event.nodes_affected} nodes decayed (need ${event.avg_need_delta.toFixed(2)}, conflict ${event.avg_conflict_delta.toFixed(2)})`;
    default: return JSON.stringify(event);
  }
}

function NodeHistoryView({
  events,
  filter,
  onFilterChange,
}: {
  events: TelemetryEvent[];
  filter: string;
  onFilterChange: (f: string) => void;
}) {
  // Find all unique node paths mentioned in events
  const nodePaths = new Set<string>();
  for (const e of events) {
    if ('target' in e && typeof e.target === 'string') nodePaths.add(e.target);
    if ('node' in e && typeof e.node === 'string') nodePaths.add(e.node);
    if ('target_path' in e && typeof e.target_path === 'string') nodePaths.add(e.target_path);
    if ('overlap_path' in e && typeof e.overlap_path === 'string') nodePaths.add(e.overlap_path);
  }

  const matchingPaths = filter
    ? Array.from(nodePaths).filter((p) => p.toLowerCase().includes(filter.toLowerCase()))
    : [];

  const filtered = filter
    ? events.filter((e) => {
        const paths = [
          'target' in e ? e.target : null,
          'node' in e ? (e as Record<string, unknown>).node : null,
          'target_path' in e ? (e as Record<string, unknown>).target_path : null,
          'overlap_path' in e ? (e as Record<string, unknown>).overlap_path : null,
        ].filter(Boolean) as string[];
        return paths.some((p) => p.toLowerCase().includes(filter.toLowerCase()));
      })
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search node path..."
          className="w-full bg-slate-50 border border-slate-200 rounded px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
        />
        {matchingPaths.length > 0 && matchingPaths.length <= 10 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {matchingPaths.map((p) => (
              <button
                key={p}
                onClick={() => onFilterChange(p)}
                className="text-[10px] text-slate-600 hover:text-blue-700 bg-slate-100 px-2 py-1 rounded hover:bg-blue-50 transition-colors border border-slate-200"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 && filter && (
        <div className="text-slate-400 text-sm text-center italic mt-10">No events found for this node.</div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {filtered.map((e, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5 text-xs border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors items-center">
            <span className="text-slate-400 font-mono w-8 text-right shrink-0 select-none">
              #{('pulse' in e ? e.pulse : '?')}
            </span>
            <span className="text-blue-600 font-semibold w-24 shrink-0 uppercase text-[10px] tracking-wide">{e.type.replace('_', ' ')}</span>
            <span className="text-slate-600 truncate flex-1 font-mono text-[11px]">
              {formatMaintenanceEvent(e)}
            </span>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}

function CostChart({
  pulses,
}: {
  pulses: Extract<TelemetryEvent, { type: 'pulse' }>[];
}) {
  if (pulses.length === 0) return null;

  // Build cumulative data
  let cumulative = 0;
  const data = pulses.map((p) => {
    cumulative += p.cost.input_tokens;
    return cumulative;
  });

  const max = Math.max(...data, 1);
  const width = 100;
  const height = 100;

  const points = data
    .map((v, i) => `${(i / (data.length - 1 || 1)) * width},${height - (v / max) * height}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#chartGradient)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
