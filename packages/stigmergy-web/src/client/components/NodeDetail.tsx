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
      <div className="text-[#707088] text-sm mt-16 text-center leading-relaxed">
        Click a node to inspect.<br /><br />
        Scroll to zoom. Drag to pan.
      </div>
    );
  }

  const isStable = node.confidence >= 8 && node.need <= 2 && node.conflict <= 1;
  const isDead = node.isPlaceholder && !node.isScaffold;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-base font-semibold text-[#f0f0f8]">{node.name}</h2>
        <button onClick={onClose} className="text-[#707088] hover:text-[#a0a0b8] text-xs">
          ESC
        </button>
      </div>
      <div className="text-[11px] text-[#8888a0] mb-4 break-all">
        {node.path === '.' ? '(root)' : node.path}
      </div>

      <div className="flex gap-1.5 mb-3">
        {node.isScaffold && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400">
            scaffold
          </span>
        )}
        {isStable && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-400">
            stable
          </span>
        )}
        {isDead && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 border-dashed">
            dead
          </span>
        )}
      </div>

      {node.conflictReasons.length > 0 && (
        <div className="mb-3 p-2 rounded bg-amber-400/5 border border-amber-400/20">
          <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1.5">Conflict Reasons</div>
          {node.conflictReasons.map((reason, i) => (
            <div key={i} className="text-[11px] text-[#c0c0d4] mb-1">
              &bull; {reason}
            </div>
          ))}
        </div>
      )}

      <SignalBar label="Need" value={node.need} type="need" />
      <SignalBar label="Confidence" value={node.confidence} type="confidence" />
      <SignalBar label="Conflict" value={node.conflict} type="conflict" />

      <div className="mt-4 pt-4 border-t border-[#3a3a55] overflow-y-auto flex-1">
        {ancestors && ancestors.length > 0 && (
          ancestors.map((a, i) => (
            <div key={a.path} className="mb-3 pb-3 border-b border-[#282845] last:border-0">
              <div className="text-[11px] text-[#a8a8b4] flex items-center gap-1.5 mb-1">
                <span className="bg-[#282845] text-[#8888a0] px-1.5 py-0 rounded text-[9px] uppercase tracking-wider">
                  {i === 0 ? 'ROOT' : `DEPTH ${i}`}
                </span>
                <span className="text-[#c4c4d0]">{a.name}</span>
              </div>
              <div className="text-[10px] text-[#707088]">
                <span className="text-red-400">n:{a.need}</span>{' '}
                <span className="text-green-400">c:{a.confidence}</span>
                {a.conflict > 0 && <span className="text-amber-400"> x:{a.conflict}</span>}
              </div>
              {a.content && (
                <div className="text-[11px] text-[#9090a8] mt-1 whitespace-pre-wrap line-clamp-3">
                  {a.content}
                </div>
              )}
            </div>
          ))
        )}

        {/* Current node content */}
        <div className="mb-3 pb-3 border-b border-[#282845]">
          <div className="text-xs text-[#a8a8b4] flex items-center gap-1.5 mb-1">
            <span className="bg-[#282845] text-[#8888a0] px-1.5 py-0 rounded text-[9px] uppercase tracking-wider">
              {node.path === '.' ? 'ROOT' : `DEPTH ${ancestors?.length ?? 0}`}
            </span>
            <span className="text-[#f0f0f8] font-semibold">{node.name}</span>
          </div>
          {node.content && (
            <div className="text-[13px] text-[#c0c0d4] mt-1 whitespace-pre-wrap leading-relaxed">
              {node.content}
            </div>
          )}
        </div>

        {siblings && siblings.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[#3a3a55]">
            <div className="text-[10px] text-[#8888a0] uppercase tracking-wider mb-1.5">Siblings</div>
            {siblings.map((s) => (
              <div key={s.path} className="text-[11px] text-[#9090a8] mb-1">
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                  style={{ background: nodeColor(s.confidence, s.conflict) }}
                />
                {s.name}
                <span className="text-[10px] text-[#707088] ml-1">
                  n:{s.need} c:{s.confidence}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function nodeColor(confidence: number, conflict: number): string {
  if (conflict > 2) return '#fbbf24';
  const t = confidence / 10;
  const r = Math.round(248 * (1 - t) + 74 * t);
  const g = Math.round(113 * (1 - t) + 222 * t);
  const b = Math.round(113 * (1 - t) + 128 * t);
  return `rgb(${r},${g},${b})`;
}
