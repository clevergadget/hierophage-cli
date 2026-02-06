import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getReplay, getReplaySummary } from '../api';
import type { TelemetryEvent } from '@hierophage/stigmergy';

const phaseColors: Record<string, string> = {
  germination: '#a78bfa',
  foraging: '#60a5fa',
  'brood-care': '#fbbf24',
  crystallization: '#4ade80',
};

const actionColors: Record<string, string> = {
  DECOMPOSE: '#60a5fa',
  REVIEW: '#a78bfa',
  UPDATE_CONTENT: '#fbbf24',
  SETTLE: '#4ade80',
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
    return <div className="flex items-center justify-center h-full text-[#707088]">Loading...</div>;
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#707088]">
        No telemetry data. Run the simulation first.
      </div>
    );
  }

  const pulseEvents = events.filter(
    (e): e is Extract<TelemetryEvent, { type: 'pulse' }> => e.type === 'pulse',
  );
  const maintenanceTypes = ['scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'flash_overlap', 'evaporation'];
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
    <div className="flex flex-col h-full">
      {/* Summary header */}
      {summary && (
        <div className="p-6 border-b border-[#3a3a55] shrink-0">
          <h2 className="text-lg font-bold text-[#f0f0f8] mb-1">Replay</h2>
          <p className="text-xs text-[#707088] mb-3 leading-relaxed">
            Every mutation is logged. Browse by{' '}
            <Link to="/concepts" className="text-blue-400 hover:text-blue-300">phase</Link>{' '}
            in Timeline, filter{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300">maintenance agents</Link>{' '}
            in Maintenance, or trace a{' '}
            <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300">node</Link>'s full history.
          </p>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-[#707088]">Reason: </span>
              <span className="text-[#e0e0ec]">{summary.reason as string}</span>
            </div>
            <div>
              <span className="text-[#707088]">Pulses: </span>
              <span className="text-[#e0e0ec]">{summary.totalPulses as number}</span>
            </div>
            <div>
              <span className="text-[#707088]">Cost: </span>
              <span className="text-[#e0e0ec]">
                {totalCost.api_calls} calls, {totalCost.input_tokens.toLocaleString()} tokens
              </span>
            </div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 px-6 pt-4 shrink-0">
        {(['timeline', 'maintenance', 'node'] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              view === v
                ? 'bg-[#282845] text-[#60a5fa] font-semibold'
                : 'text-[#a0a0b8] hover:text-[#e0e0ec]'
            }`}
          >
            {v === 'timeline' ? 'Timeline' : v === 'maintenance' ? 'Maintenance' : 'Node History'}
          </button>
        ))}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
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
      <div className="h-24 border-t border-[#3a3a55] px-6 py-3 shrink-0">
        <div className="text-[10px] text-[#707088] uppercase tracking-wider mb-2">
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
    <div className="flex gap-6">
      <div className="flex-1">
        {groups.map((group, gi) => (
          <div key={gi} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: phaseColors[group.phase] || '#a0a0b8' }}
              />
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: phaseColors[group.phase] || '#a0a0b8' }}
              >
                {group.phase}
              </span>
              <span className="text-[10px] text-[#707088]">{group.pulses.length} pulses</span>
            </div>

            <div className="flex flex-wrap gap-1.5 ml-5">
              {group.pulses.map((p) => (
                <button
                  key={p.pulse}
                  onClick={() => onSelectPulse(selectedPulse === p.pulse ? null : p.pulse)}
                  className={`w-5 h-5 rounded-full border transition-all ${
                    selectedPulse === p.pulse
                      ? 'border-[#60a5fa] ring-2 ring-[#60a5fa]/30'
                      : 'border-[#3a3a55] hover:border-[#606078]'
                  }`}
                  style={{ background: actionColors[p.action] || '#606078' }}
                  title={`#${p.pulse}: ${p.action} → ${p.target}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 bg-[#1e1e32] border border-[#3a3a55] rounded p-4 shrink-0 self-start">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-[#f0f0f8]">Pulse #{selected.pulse}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: `${actionColors[selected.action] || '#606078'}33`,
                color: actionColors[selected.action] || '#a0a0b8',
              }}
            >
              {selected.action}
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div>
              <span className="text-[#707088]">Target: </span>
              <span className="text-[#e0e0ec]">{selected.target}</span>
            </div>
            {selected.reasoning && (
              <div>
                <span className="text-[#707088]">Reasoning: </span>
                <span className="text-[#a0a0b8]">{selected.reasoning}</span>
              </div>
            )}
            <div>
              <span className="text-[#707088]">Mutations: </span>
              <span className="text-[#e0e0ec]">
                {selected.mutations_succeeded}/{selected.mutations_attempted}
              </span>
            </div>
            <div>
              <span className="text-[#707088]">Cost: </span>
              <span className="text-[#e0e0ec]">
                {selected.cost.api_calls} calls, {selected.cost.input_tokens} tokens
              </span>
            </div>
            <div className="pt-2 border-t border-[#3a3a55]">
              <span className="text-[#707088]">Stats after: </span>
              <span className="text-[#a0a0b8]">
                {selected.stats.total_nodes} nodes, conf {selected.stats.avg_confidence},{' '}
                {selected.stats.stable_count} stable
              </span>
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
  const types = ['all', 'scout', 'grazer', 'verifier_stability', 'verifier_coverage', 'propagation', 'resolver', 'synthesizer', 'flash_overlap', 'evaporation'];
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);

  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => onFilterChange(t)}
            className={`px-2 py-1 text-[10px] rounded transition-colors ${
              filter === t
                ? 'bg-[#282845] text-[#60a5fa]'
                : 'text-[#8888a0] hover:text-[#a0a0b8]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {filtered.map((e, i) => (
          <div key={i} className="flex gap-3 py-1.5 text-xs border-b border-[#282845]">
            <span className="text-[#707088] w-8 text-right shrink-0">
              #{('pulse' in e ? e.pulse : '?')}
            </span>
            <span className="text-amber-400/80 w-28 shrink-0 uppercase text-[10px]">
              {e.type}
            </span>
            <span className="text-[#a0a0b8] truncate">
              {formatMaintenanceEvent(e)}
            </span>
          </div>
        ))}
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
    case 'flash_overlap': return `${event.target_path} ~ ${event.overlap_path}: ${event.reason}`;
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
    <div>
      <div className="mb-4">
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search node path..."
          className="w-64 bg-[#1e1e32] border border-[#3a3a55] rounded px-3 py-1.5 text-xs text-[#e0e0ec] placeholder-[#606078] focus:outline-none focus:border-[#60a5fa]"
        />
        {matchingPaths.length > 0 && matchingPaths.length <= 10 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {matchingPaths.map((p) => (
              <button
                key={p}
                onClick={() => onFilterChange(p)}
                className="text-[10px] text-[#a0a0b8] hover:text-[#e0e0ec] bg-[#282845] px-2 py-0.5 rounded"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 && filter && (
        <div className="text-[#707088] text-sm">No events for this node.</div>
      )}

      <div className="space-y-1">
        {filtered.map((e, i) => (
          <div key={i} className="flex gap-3 py-1.5 text-xs border-b border-[#282845]">
            <span className="text-[#707088] w-8 text-right shrink-0">
              #{('pulse' in e ? e.pulse : '?')}
            </span>
            <span className="text-blue-400/80 w-20 shrink-0">{e.type}</span>
            <span className="text-[#a0a0b8] truncate">
              {formatMaintenanceEvent(e)}
            </span>
          </div>
        ))}
      </div>
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
      <polyline
        points={points}
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
