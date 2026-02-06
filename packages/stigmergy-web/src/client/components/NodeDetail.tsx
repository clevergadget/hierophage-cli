import { SignalBar } from './SignalBar';
import type { VizNode } from '../../shared/types';

interface NodeDetailProps {
  node: VizNode | null;
  ancestors?: VizNode[];
  siblings?: VizNode[];
  onClose: () => void;
}

export function NodeDetail({ node, ancestors, siblings, onClose }: NodeDetailProps) {
  if (!node) {
    return (
      <div className="text-slate-400 text-base mt-20 text-center leading-relaxed italic px-8">
        Click a node to inspect.<br /><br />
        Scroll to zoom. Drag to pan.
      </div>
    );
  }

  const isStable = node.confidence >= 8 && node.need <= 2 && node.conflict <= 1;
  const isDead = node.isPlaceholder && !node.isScaffold;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Fixed Header Section */}
      <div className="px-6 pt-6">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-xl font-serif font-bold text-slate-900 leading-tight">{node.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1 bg-slate-100 rounded hover:bg-slate-200 transition-colors ml-4">
            ESC
          </button>
        </div>
        <div className="text-xs text-slate-500 mb-6 break-all font-mono bg-slate-50 p-2.5 rounded border border-slate-100">
          {node.path === '.' ? '(root)' : node.path}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {node.isScaffold && (
            <span className="text-xs px-2.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-bold tracking-wide uppercase">
              scaffold
            </span>
          )}
          {isStable && (
            <span className="text-xs px-2.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold tracking-wide uppercase">
              stable
            </span>
          )}
          {isDead && (
            <span className="text-xs px-2.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 border-dashed font-bold tracking-wide uppercase">
              dead
            </span>
          )}
        </div>

        {node.conflictReasons.length > 0 && (
          <div className="mb-6 p-4 rounded bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-700 uppercase tracking-wider mb-2 font-bold">Conflict Reasons</div>
            {node.conflictReasons.map((reason, i) => (
              <div key={i} className="text-sm text-slate-700 mb-1.5 pl-3 border-l-2 border-amber-300">
                {reason}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5 mb-6">
          <SignalBar label="Need" value={node.need} type="need" />
          <SignalBar label="Confidence" value={node.confidence} type="confidence" />
          <SignalBar label="Conflict" value={node.conflict} type="conflict" />
        </div>
      </div>

      <div className="mt-0 pt-6 px-6 pb-6 border-t border-slate-200 overflow-y-auto flex-1 custom-scrollbar">
        {ancestors && ancestors.length > 0 && (
          ancestors.map((a, i) => (
            <div key={a.path} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
              <div className="text-xs text-slate-400 flex items-center gap-2 mb-2">
                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border border-slate-200">
                  {i === 0 ? 'ROOT' : `DEPTH ${i}`}
                </span>
                <span className="text-slate-700 font-medium">{a.name}</span>
              </div>
              <div className="text-xs text-slate-400 font-mono pl-1 mb-2">
                <span className={a.need > 5 ? "text-red-500 font-bold" : ""}>n:{a.need}</span>{' '}
                <span className="text-emerald-600">c:{a.confidence}</span>
                {a.conflict > 0 && <span className="text-amber-500 font-bold"> x:{a.conflict}</span>}
              </div>
              {a.content && (
                <div className="text-sm text-slate-500 mt-2 whitespace-pre-wrap line-clamp-3 pl-3 border-l-2 border-slate-100 italic">
                  {a.content}
                </div>
              )}
            </div>
          ))
        )}

        {/* Current node content */}
        <div className="mb-6 pb-6 border-b border-slate-100">
          <div className="text-sm text-slate-400 flex items-center gap-2 mb-3">
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border border-slate-200">
              {node.path === '.' ? 'ROOT' : `DEPTH ${ancestors?.length ?? 0}`}
            </span>
            <span className="text-slate-900 font-bold">{node.name}</span>
          </div>
          {node.content && (
            <div className="text-[15px] text-slate-800 mt-2 whitespace-pre-wrap leading-relaxed">
              {node.content}
            </div>
          )}
        </div>

        {siblings && siblings.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-bold">Siblings</div>
            <div className="space-y-1.5">
              {siblings.map((s) => (
                <div key={s.path} className="text-sm text-slate-600 flex items-center gap-2 hover:bg-slate-50 p-1.5 rounded transition-colors -mx-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full border border-slate-200"
                    style={{ background: nodeColor(s.confidence, s.conflict) }}
                  />
                  <span className="truncate flex-1">{s.name}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    n:{s.need} c:{s.confidence}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function nodeColor(confidence: number, conflict: number): string {
  if (conflict > 2) return '#fbbf24';
  const t = confidence / 10;
  // Adjusted for light mode (slightly more saturated/darker to stand out against white)
  const r = Math.round(239 * (1 - t) + 34 * t);  // Red-500 to Emerald-500 approx
  const g = Math.round(68 * (1 - t) + 197 * t);
  const b = Math.round(68 * (1 - t) + 94 * t);
  return `rgb(${r},${g},${b})`;
}
