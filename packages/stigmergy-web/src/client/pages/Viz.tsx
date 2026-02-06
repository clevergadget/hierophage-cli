import { useState, useCallback } from 'react';
import { useTree } from '../hooks/useTree';
import { TreeViz } from '../components/TreeViz';
import { NodeDetail } from '../components/NodeDetail';
import type { VizNode } from '../../shared/types';

const phaseColors: Record<string, string> = {
  germination: '#8b5cf6', // violet-500
  foraging: '#3b82f6',    // blue-500
  'brood-care': '#f59e0b', // amber-500
  crystallization: '#22c55e', // green-500
};

export function Viz() {
  const { tree, status, loading } = useTree();
  const [selectedNode, setSelectedNode] = useState<VizNode | null>(null);
  const [ancestors, setAncestors] = useState<VizNode[]>([]);
  const [siblings, setSiblings] = useState<VizNode[]>([]);

  const handleSelectNode = useCallback(
    (node: VizNode, anc: VizNode[], sib: VizNode[]) => {
      setSelectedNode(node);
      setAncestors(anc);
      setSiblings(sib);
    },
    [],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setAncestors([]);
    setSiblings([]);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">Loading...</div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No workspace. Initialize from the Dashboard.
      </div>
    );
  }

  const phase = status?.phase || 'unknown';
  const phaseColor = phaseColors[phase] || '#94a3b8';
  const stats = status?.stats;

  return (
    <div className="flex h-full bg-slate-50">
      {/* Header bar */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-6 shrink-0 shadow-sm z-10">
          <span className="text-sm font-serif font-bold text-slate-900 tracking-wider">TREE</span>
          <span
            className="text-[10px] font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider"
            style={{
              background: `${phaseColor}22`,
              color: phaseColor,
              border: `1px solid ${phaseColor}44`,
            }}
          >
            {phase}
          </span>
          {stats && (
            <>
              <span className="text-xs text-slate-500">
                Nodes: <span className="text-slate-900 font-semibold">{stats.total_nodes}</span>
              </span>
              <span className="text-xs text-slate-500">
                Stable: <span className="text-emerald-600 font-semibold">{stats.stable_count}</span>
              </span>
              <span className="text-xs text-slate-500">
                Conflict:{' '}
                <span className={`font-semibold ${stats.nodes_in_conflict > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {stats.nodes_in_conflict}
                </span>
              </span>
              <span className="text-xs text-slate-500">
                Avg conf: <span className="text-slate-900 font-semibold">{stats.avg_confidence}</span>
              </span>
            </>
          )}
        </div>

        {/* D3 canvas */}
        <div className="flex-1 bg-slate-50">
          <TreeViz
            data={tree}
            onSelectNode={handleSelectNode}
            onClearSelection={handleClearSelection}
            selectedPath={selectedNode?.path}
          />
        </div>

        {/* Legend */}
        <div className="h-12 bg-white border-t border-slate-200 flex items-center px-6 gap-7 shrink-0 z-10">
          <LegendItem color="#ef4444" label="Urgent" />
          <LegendItem color="#f97316" label="In progress" />
          <LegendItem color="#10b981" label="Settled" />
          <LegendItem color="#10b981" label="Stable" glow />
          <LegendItem color="#f59e0b" label="Conflict" />
          <LegendItem color="#64748b" label="Scaffold" diamond />
          <LegendItem color="#94a3b8" label="Dead" dashed />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[400px] bg-white border-l border-slate-200 p-0 overflow-hidden shrink-0 shadow-sm relative z-20">
        <NodeDetail
          node={selectedNode}
          ancestors={ancestors}
          siblings={siblings}
          onClose={handleClearSelection}
        />
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  glow,
  diamond,
  dashed,
}: {
  color: string;
  label: string;
  glow?: boolean;
  diamond?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
      <div
        className="w-3 h-3 shrink-0"
        style={{
          background: color,
          borderRadius: diamond ? '2px' : '50%',
          transform: diamond ? 'rotate(45deg) scale(0.8)' : undefined,
          border: dashed ? '1.5px dashed #94a3b8' : glow ? '2px solid #bef264' : `1px solid ${color}44`,
          boxShadow: glow ? '0 0 6px rgba(34, 197, 94, 0.4)' : undefined,
          opacity: dashed ? 0.6 : 1,
        }}
      />
      {label}
    </div>
  );
}
