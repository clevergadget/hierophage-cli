import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { startRun, stopRun, getRunStatus } from '../api';
import { useRunStream } from '../hooks/useRunStream';
import { PulseEventCard } from '../components/PulseEvent';

const phaseColors: Record<string, string> = {
  germination: '#a78bfa',
  foraging: '#60a5fa',
  'brood-care': '#fbbf24',
  crystallization: '#4ade80',
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
    <div className="flex h-full">
      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Controls */}
        <div className="p-6 border-b border-[#3a3a55] shrink-0">
          <h2 className="text-lg font-bold text-[#f0f0f8] mb-2">Run Control</h2>
          <p className="text-xs text-[#707088] mb-4 leading-relaxed max-w-xl">
            Each pulse, the{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300">FlashSpore agent</Link>{' '}
            picks the highest-priority{' '}
            <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300">node</Link>{' '}
            and decides to decompose, review, update, or settle it.
            Every 10 pulses,{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300">maintenance agents</Link>{' '}
            run: Scout, Grazer, Verifier, Resolver, Synthesizer.
            The run ends when the tree is{' '}
            <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300">stable</Link>{' '}
            or the budget is exhausted.
          </p>

          <div className="flex items-end gap-6 mb-4">
            <div>
              <label className="block text-[10px] text-[#a0a0b8] uppercase tracking-wider mb-1">
                Max Pulses
              </label>
              <input
                type="number"
                value={maxPulses}
                onChange={(e) => setMaxPulses(Number(e.target.value))}
                disabled={runActive}
                className="w-24 bg-[#1e1e32] border border-[#3a3a55] rounded px-2 py-1.5 text-sm text-[#e0e0ec] focus:outline-none focus:border-[#60a5fa] disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#a0a0b8] uppercase tracking-wider mb-1">
                Parallel
              </label>
              <input
                type="number"
                value={parallel}
                onChange={(e) => setParallel(Number(e.target.value))}
                disabled={runActive}
                min={1}
                max={32}
                className="w-20 bg-[#1e1e32] border border-[#3a3a55] rounded px-2 py-1.5 text-sm text-[#e0e0ec] focus:outline-none focus:border-[#60a5fa] disabled:opacity-40"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#a0a0b8] cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={runActive}
                className="accent-blue-500"
              />
              Dry run
            </label>

            {!runActive ? (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-6 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded text-sm font-semibold hover:bg-green-600/30 transition-colors disabled:opacity-40"
              >
                {starting ? 'Starting...' : 'Start Run'}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="px-6 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-sm font-semibold hover:bg-red-600/30 transition-colors"
              >
                Stop
              </button>
            )}
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>

        {/* Pulse stream */}
        <div ref={streamRef} className="flex-1 overflow-y-auto">
          {stream.pulses.length === 0 && !runActive && (
            <div className="px-8 py-12 max-w-lg mx-auto">
              <div className="text-sm font-semibold text-[#f0f0f8] mb-4 text-center">
                What happens during a run
              </div>

              {/* Pulse lifecycle visual */}
              <div className="space-y-3 mb-6">
                <LifecycleStep number={1} color="#60a5fa" label="Scan">
                  Read every node's signals. Calculate priority for each.
                </LifecycleStep>
                <div className="flex justify-center">
                  <div className="w-px h-3 bg-[#3a3a55]" />
                </div>
                <LifecycleStep number={2} color="#a78bfa" label="Select">
                  Pick the N highest-priority nodes (avoiding siblings for parallel safety).
                </LifecycleStep>
                <div className="flex justify-center">
                  <div className="w-px h-3 bg-[#3a3a55]" />
                </div>
                <LifecycleStep number={3} color="#fbbf24" label="Pulse">
                  FlashSpore reads each target's context and decides: decompose, review, update, or settle.
                </LifecycleStep>
                <div className="flex justify-center">
                  <div className="w-px h-3 bg-[#3a3a55]" />
                </div>
                <LifecycleStep number={4} color="#4ade80" label="Apply">
                  Mutations go through the dispatcher. Signals update. The tree changes.
                </LifecycleStep>
                <div className="flex justify-center">
                  <div className="w-px h-3 bg-[#3a3a55]" />
                </div>
                <LifecycleStep number={5} color="#f87171" label="Maintain" subtitle="every 10 pulses">
                  Verifier, Scout, Grazer, Resolver, Synthesizer run in sequence.
                </LifecycleStep>
              </div>

              <div className="text-center">
                <div className="text-[11px] text-[#707088] mb-1">
                  Repeats until the tree is stable or budget is exhausted.
                </div>
                <div className="text-[10px] text-[#606078]">
                  A typical 200-pulse run takes ~3 minutes and costs ~$0.06.
                </div>
              </div>
            </div>
          )}

          {stream.pulses.length === 0 && runActive && (
            <div className="text-[#707088] text-sm text-center mt-16 animate-pulse">
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
              <div key={i}>
                {phaseChange && (
                  <div className="flex items-center gap-3 px-6 py-2 bg-[#1e1e32]">
                    <div className="h-px flex-1 bg-[#3a3a55]" />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2"
                      style={{ color: phaseColors[phaseChange.to] || '#a0a0b8' }}
                    >
                      {phaseChange.from} → {phaseChange.to}
                    </span>
                    <div className="h-px flex-1 bg-[#3a3a55]" />
                  </div>
                )}
                <PulseEventCard event={pulse} />
              </div>
            );
          })}

          {/* Maintenance events inline */}
          {stream.maintenanceEvents.length > 0 && (
            <div className="border-t border-[#3a3a55] mt-2">
              {stream.maintenanceEvents.map((evt, i) => (
                <div key={i} className="px-6 py-1.5 text-[11px] text-[#8888a0] flex gap-2">
                  <span className="text-amber-400/60 uppercase w-20 shrink-0">{evt.agent}</span>
                  <span className="truncate">{JSON.stringify(evt.details)}</span>
                </div>
              ))}
            </div>
          )}

          {stream.runEnded && (
            <div className="mx-6 my-4 p-4 bg-[#1e1e32] border border-[#3a3a55] rounded">
              <div className="text-sm font-semibold text-[#f0f0f8] mb-1">Run Complete</div>
              <div className="text-xs text-[#a0a0b8]">
                Reason: {stream.endReason}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats sidebar */}
      <div className="w-64 bg-[#1e1e32] border-l border-[#3a3a55] p-5 shrink-0">
        <h3 className="text-sm font-semibold text-[#f0f0f8] mb-4">Live Stats</h3>

        <div className="space-y-4">
          <StatItem label="Pulses" value={stream.pulses.length} />
          <StatItem
            label="Phase"
            value={lastPulse?.phase || '—'}
            color={phaseColors[lastPulse?.phase || ''] || '#a0a0b8'}
          />
          <StatItem label="Nodes" value={lastPulse?.stats?.total_nodes ?? '—'} />
          <StatItem
            label="Avg Confidence"
            value={lastPulse?.stats?.avg_confidence ?? '—'}
            color="#4ade80"
          />
          <StatItem
            label="Stable"
            value={lastPulse?.stats?.stable_count ?? '—'}
            color="#4ade80"
          />
          <StatItem
            label="Conflict"
            value={lastPulse?.stats?.nodes_in_conflict ?? '—'}
            color={
              (lastPulse?.stats?.nodes_in_conflict ?? 0) > 0 ? '#f87171' : undefined
            }
          />

          <div className="pt-4 border-t border-[#3a3a55]">
            <div className="text-[10px] text-[#707088] uppercase tracking-wider mb-2">Cost</div>
            <div className="text-xs text-[#a0a0b8] space-y-1">
              <div>
                API calls: <span className="text-[#e0e0ec]">{totalCost.api_calls}</span>
              </div>
              <div>
                Input tokens: <span className="text-[#e0e0ec]">{totalCost.input_tokens.toLocaleString()}</span>
              </div>
              <div>
                Output tokens: <span className="text-[#e0e0ec]">{totalCost.output_tokens.toLocaleString()}</span>
              </div>
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
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-[#707088] uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-lg font-bold" style={{ color: color || '#e0e0ec' }}>
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
    <div className="flex items-start gap-3 bg-[#1e1e32] border border-[#3a3a55] rounded p-3">
      <span
        className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
      >
        {number}
      </span>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#f0f0f8]">{label}</span>
          {subtitle && <span className="text-[10px] text-[#707088]">{subtitle}</span>}
        </div>
        <div className="text-[11px] text-[#a0a0b8] leading-relaxed mt-0.5">{children}</div>
      </div>
    </div>
  );
}
