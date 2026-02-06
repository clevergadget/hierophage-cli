import { useState, useCallback } from 'react';
import { useTree } from '../hooks/useTree';
import { TreeViz } from '../components/TreeViz';
import { NodeDetail } from '../components/NodeDetail';
import type { VizNode } from '../../shared/types';

const phaseColors: Record<string, string> = {
  germination: '#a78bfa',
  foraging: '#60a5fa',
  'brood-care': '#fbbf24',
  crystallization: '#4ade80',
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
      <div className="flex items-center justify-center h-full text-[#707088]">Loading...</div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-[#707088]">
        No workspace. Initialize from the Dashboard.
      </div>
    );
  }

  const phase = status?.phase || 'unknown';
  const phaseColor = phaseColors[phase] || '#a0a0b8';
  const stats = status?.stats;

  return (
    <div className="flex h-full">
      {/* Header bar */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 bg-[#1e1e32] border-b border-[#3a3a55] flex items-center px-6 gap-6 shrink-0">
          <span className="text-sm font-bold text-[#f0f0f8] tracking-wider">TREE</span>
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
              <span className="text-xs text-[#9090a8]">
                Nodes: <span className="text-[#e0e0ec] font-semibold">{stats.total_nodes}</span>
              </span>
              <span className="text-xs text-[#9090a8]">
                Stable: <span className="text-green-400 font-semibold">{stats.stable_count}</span>
              </span>
              <span className="text-xs text-[#9090a8]">
                Conflict:{' '}
                <span className={`font-semibold ${stats.nodes_in_conflict > 0 ? 'text-red-400' : 'text-[#e0e0ec]'}`}>
                  {stats.nodes_in_conflict}
                </span>
              </span>
              <span className="text-xs text-[#9090a8]">
                Avg conf: <span className="text-[#e0e0ec] font-semibold">{stats.avg_confidence}</span>
              </span>
            </>
          )}
        </div>

        {/* D3 canvas */}
        <div className="flex-1">
          <TreeViz
            data={tree}
            onSelectNode={handleSelectNode}
            onClearSelection={handleClearSelection}
            selectedPath={selectedNode?.path}
          />
        </div>

        {/* Legend */}
        <div className="h-12 bg-[#1e1e32] border-t border-[#3a3a55] flex items-center px-6 gap-7 shrink-0">
          <LegendItem color="#f87171" label="Urgent" />
          <LegendItem color="#c17a6a" label="In progress" />
          <LegendItem color="#7db890" label="Settled" />
          <LegendItem color="#4ade80" label="Stable" glow />
          <LegendItem color="#fbbf24" label="Conflict" />
          <LegendItem color="#c17a6a" label="Scaffold" diamond />
          <LegendItem color="#c17a6a55" label="Dead" dashed />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[340px] bg-[#1e1e32] border-l border-[#3a3a55] p-5 overflow-y-auto shrink-0">
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
    <div className="flex items-center gap-2 text-[11px] text-[#a0a0b8]">
      <div
        className="w-3 h-3 shrink-0"
        style={{
          background: color,
          borderRadius: diamond ? '2px' : '50%',
          transform: diamond ? 'rotate(45deg) scale(0.8)' : undefined,
          border: dashed ? '1.5px dashed #f87171' : glow ? '2px solid #22c55e' : undefined,
          boxShadow: glow ? '0 0 6px #4ade8066' : undefined,
          opacity: dashed ? 0.6 : 1,
        }}
      />
      {label}
    </div>
  );
}
