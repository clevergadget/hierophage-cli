import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { startRun, stopRun, getRunStatus } from '../api';
import { useRunStream } from '../hooks/useRunStream';
import { PulseEventCard } from '../components/PulseEvent';

const phaseColors: Record<string, string> = {
  germination: '#8b5cf6', // violet-500
  foraging: '#3b82f6',    // blue-500
  'brood-care': '#f59e0b', // amber-500
  crystallization: '#22c55e', // green-500
};

export function Run() {
  const [runActive, setRunActive] = useState(false);
  const [maxPulses, setMaxPulses] = useState(100);
  const [parallel, setParallel] = useState(8);
  const [dryRun, setDryRun] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);

  const stream = useRunStream(runActive);

  // Check if a run is already active on mount
  useEffect(() => {
    getRunStatus().then((status) => {
      if (status.active) setRunActive(true);
    }).catch(() => {});
  }, []);

  // Auto-scroll pulse stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [stream.pulses.length]);

  // Detect run end
  useEffect(() => {
    if (stream.runEnded) {
      setRunActive(false);
    }
  }, [stream.runEnded]);

  const handleStart = async () => {
    setStarting(true);
    setError('');
    stream.reset();

    try {
      await startRun({ maxPulses, parallel, dryRun });
      setRunActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await stopRun();
      setRunActive(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop run');
    }
  };

  // Compute live stats
  const lastPulse = stream.pulses[stream.pulses.length - 1];
  const totalCost = stream.pulses.reduce(
    (acc, p) => ({
      api_calls: acc.api_calls + p.cost.api_calls,
      input_tokens: acc.input_tokens + p.cost.input_tokens,
      output_tokens: acc.output_tokens + p.cost.output_tokens,
    }),
    { api_calls: 0, input_tokens: 0, output_tokens: 0 },
  );

  return (
    <div className="flex h-full bg-slate-50">
      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Controls */}
        <div className="p-6 border-b border-slate-200 shrink-0 bg-white shadow-sm z-10">
          <h2 className="text-xl font-serif font-bold text-slate-900 mb-2">Run Control</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-xl">
            Each pulse, the{' '}
            <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">FlashSpore agent</Link>{' '}
            picks the highest-priority{' '}
            <Link to="/tree-guide" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">node</Link>{' '}
            and decides to decompose, review, update, or settle it.
            Every 10 pulses,{' '}
            <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">maintenance agents</Link>{' '}
            run: Scout, Grazer, Verifier, Resolver, Synthesizer.
            The run ends when the tree is{' '}
            <Link to="/tree-guide" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">stable</Link>{' '}
            or the budget is exhausted.
          </p>

          <div className="flex items-end gap-6 mb-4">
            <div>
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                Max Pulses
              </label>
              <input
                type="number"
                value={maxPulses}
                onChange={(e) => setMaxPulses(Number(e.target.value))}
                disabled={runActive}
                className="w-24 bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                Parallel
              </label>
              <input
                type="number"
                value={parallel}
                onChange={(e) => setParallel(Number(e.target.value))}
                disabled={runActive}
                min={1}
                max={32}
                className="w-20 bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:bg-slate-50"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer pb-1 select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={runActive}
                className="accent-blue-600 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Dry run
            </label>

            {!runActive ? (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-6 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-all disabled:opacity-50 shadow-sm"
              >
                {starting ? 'Starting...' : 'Start Run'}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="px-6 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-all shadow-sm"
              >
                Stop
              </button>
            )}
          </div>

          {error && <div className="text-red-600 text-sm mt-2 bg-red-50 p-2 rounded border border-red-100">{error}</div>}
        </div>

        {/* Pulse stream */}
        <div ref={streamRef} className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-4">
          {stream.pulses.length === 0 && !runActive && (
            <div className="px-8 py-12 max-w-lg mx-auto bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-base font-serif font-bold text-slate-900 mb-6 text-center">
                What happens during a run
              </div>

              {/* Pulse lifecycle visual */}
              <div className="space-y-4 mb-8">
                <LifecycleStep number={1} color="#3b82f6" label="Scan">
                  Read every node's signals. Calculate priority for each.
                </LifecycleStep>
                <div className="flex justify-center -my-2 relative z-0">
                  <div className="w-px h-6 bg-slate-200" />
                </div>
                <LifecycleStep number={2} color="#8b5cf6" label="Select">
                  Pick the N highest-priority nodes (avoiding siblings for parallel safety).
                </LifecycleStep>
                <div className="flex justify-center -my-2 relative z-0">
                  <div className="w-px h-6 bg-slate-200" />
                </div>
                <LifecycleStep number={3} color="#f59e0b" label="Pulse">
                  FlashSpore reads each target's context and decides: decompose, review, update, or settle.
                </LifecycleStep>
                <div className="flex justify-center -my-2 relative z-0">
                  <div className="w-px h-6 bg-slate-200" />
                </div>
                <LifecycleStep number={4} color="#22c55e" label="Apply">
                  Mutations go through the dispatcher. Signals update. The tree changes.
                </LifecycleStep>
                <div className="flex justify-center -my-2 relative z-0">
                  <div className="w-px h-6 bg-slate-200" />
                </div>
                <LifecycleStep number={5} color="#ef4444" label="Maintain" subtitle="every 10 pulses">
                  Verifier, Scout, Grazer, Resolver, Synthesizer run in sequence.
                </LifecycleStep>
              </div>

              <div className="text-center pt-6 border-t border-slate-100">
                <div className="text-xs text-slate-500 mb-1">
                  Repeats until the tree is stable or budget is exhausted.
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                  A typical 200-pulse run takes ~3 minutes and costs ~$0.06.
                </div>
              </div>
            </div>
          )}

          {stream.pulses.length === 0 && runActive && (
            <div className="text-slate-400 text-sm text-center mt-16 animate-pulse font-medium">
              Waiting for first pulse...
            </div>
          )}

          {stream.pulses.map((pulse, i) => {
            // Check if there's a phase change before this pulse
            const phaseChange = stream.phaseChanges.find(
              (pc) =>
                i > 0 &&
                stream.pulses[i - 1]?.phase !== pulse.phase &&
                pc.to === pulse.phase,
            );

            return (
              <div key={i} className="mb-4">
                {phaseChange && (
                  <div className="flex items-center gap-3 py-4 mb-4">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-white border rounded-full shadow-sm"
                      style={{ 
                        color: phaseColors[phaseChange.to] || '#64748b',
                        borderColor: `${phaseColors[phaseChange.to]}40`
                      }}
                    >
                      {phaseChange.from} → {phaseChange.to}
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                <PulseEventCard event={pulse} />
              </div>
            );
          })}

          {/* Maintenance events inline */}
          {stream.maintenanceEvents.length > 0 && (
            <div className="border-t border-slate-200 mt-6 pt-4 bg-white rounded-lg p-4 shadow-sm">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-3 px-2">Maintenance Log</div>
              {stream.maintenanceEvents.map((evt, i) => (
                <div key={i} className="px-2 py-1.5 text-[11px] text-slate-600 flex gap-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded transition-colors">
                  <span className="text-amber-600 font-bold uppercase w-24 shrink-0 tracking-wide text-[10px] pt-0.5">{evt.agent}</span>
                  <span className="font-mono text-slate-500 truncate">{JSON.stringify(evt.details)}</span>
                </div>
              ))}
            </div>
          )}

          {stream.runEnded && (
            <div className="mx-auto max-w-lg my-8 p-6 bg-slate-100 border border-slate-200 rounded-lg text-center shadow-inner">
              <div className="text-lg font-serif font-bold text-slate-900 mb-2">Run Complete</div>
              <div className="text-sm text-slate-600 max-w-prose mx-auto">
                {stream.endReason}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats sidebar */}
      <div className="w-72 bg-white border-l border-slate-200 p-6 shrink-0 h-full overflow-y-auto shadow-sm z-20">
        <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-wider border-b border-slate-100 pb-2">Live Stats</h3>

        <div className="space-y-6">
          <StatItem label="Pulses" value={stream.pulses.length} />
          <StatItem
            label="Phase"
            value={lastPulse?.phase || '—'}
            color={phaseColors[lastPulse?.phase || ''] || '#94a3b8'}
          />
          <StatItem label="Nodes" value={lastPulse?.stats?.total_nodes ?? '—'} />
          <StatItem
            label="Avg Confidence"
            value={lastPulse?.stats?.avg_confidence ?? '—'}
            color="#22c55e"
          />
          <StatItem
            label="Stable"
            value={lastPulse?.stats?.stable_count ?? '—'}
            color="#22c55e"
          />
          <StatItem
            label="Conflict"
            value={lastPulse?.stats?.nodes_in_conflict ?? '—'}
            color={
              (lastPulse?.stats?.nodes_in_conflict ?? 0) > 0 ? '#ef4444' : undefined
            }
          />

          <div className="pt-6 border-t border-slate-200">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-3 font-bold">Cost</div>
            <div className="space-y-3">
              <StatItem label="API Calls" value={totalCost.api_calls} compact />
              <StatItem label="Input Tokens" value={totalCost.input_tokens.toLocaleString()} compact />
              <StatItem label="Output Tokens" value={totalCost.output_tokens.toLocaleString()} compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
  compact,
}: {
  label: string;
  value: string | number;
  color?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex justify-between items-center" : ""}>
      <div className={`text-[10px] text-slate-500 uppercase tracking-wider font-semibold ${compact ? "" : "mb-1"}`}>
        {label}
      </div>
      <div
        className={`${compact ? "text-xs" : "text-xl"} font-mono font-medium truncate`}
        style={{ color: color || '#0f172a' }}
      >
        {value}
      </div>
    </div>
  );
}

function LifecycleStep({
  number,
  color,
  label,
  subtitle,
  children,
}: {
  number: number;
  color: string;
  label: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 relative z-10 bg-white p-2 rounded-lg border border-transparent hover:border-slate-100 transition-colors">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0 mt-0.5"
        style={{ background: color }}
      >
        {number}
      </div>
      <div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-bold text-slate-900 text-sm" style={{ color }}>{label}</span>
          {subtitle && <span className="text-[10px] text-slate-400 uppercase tracking-wide">{subtitle}</span>}
        </div>
        <div className="text-xs text-slate-600 leading-relaxed max-w-xs">
          {children}
        </div>
      </div>
    </div>
  );
}
