import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { VizNode } from '../../shared/types';

interface TreeVizProps {
  data: VizNode;
  onSelectNode: (node: VizNode, ancestors: VizNode[], siblings: VizNode[]) => void;
  onClearSelection: () => void;
  selectedPath?: string;
}

type D3Node = d3.HierarchyPointNode<VizNode>;

function nodeColor(d: D3Node): string {
  const data = d.data;
  if (data.conflict > 2) return '#fbbf24';
  const t = data.confidence / 10;
  const r = Math.round(248 * (1 - t) + 74 * t);
  const g = Math.round(113 * (1 - t) + 222 * t);
  const b = Math.round(113 * (1 - t) + 128 * t);
  return `rgb(${r},${g},${b})`;
}

function nodeRadius(d: D3Node): number {
  return Math.max(5, 4 + d.data.need * 0.8);
}

function isStable(d: D3Node): boolean {
  return d.data.confidence >= 8 && d.data.need <= 2 && d.data.conflict <= 1;
}

function isDead(d: D3Node): boolean {
  return d.data.isPlaceholder && !d.data.isScaffold;
}

export function TreeViz({ data, onSelectNode, onClearSelection, selectedPath }: TreeVizProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleNodeClick = useCallback(
    (_event: MouseEvent, d: D3Node) => {
      const ancestors = d
        .ancestors()
        .reverse()
        .slice(0, -1)
        .map((a) => a.data);
      const siblings = d.parent
        ? d.parent.children?.filter((s) => s !== d).map((s) => s.data) ?? []
        : [];
      onSelectNode(d.data, ancestors, siblings);
    },
    [onSelectNode],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    // Clear previous
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;

    const root = d3.hierarchy(data);
    const treeLayout = d3.tree<VizNode>().nodeSize([36, 220]);
    treeLayout(root as d3.HierarchyNode<VizNode>);

    const typedRoot = root as D3Node;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    svgRef.current = svg.node();

    const g = svg.append('g');

    // Zoom + pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);

    // Initial position
    svg.call(zoom.transform, d3.zoomIdentity.translate(80, height / 2));

    // Links
    const allLinks = g
      .selectAll<SVGPathElement, d3.HierarchyPointLink<VizNode>>('.link')
      .data(typedRoot.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#3a3a55')
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkHorizontal<d3.HierarchyPointLink<VizNode>, d3.HierarchyPointNode<VizNode>>()
          .x((d) => d.y)
          .y((d) => d.x),
      );

    // Nodes
    const node = g
      .selectAll<SVGGElement, D3Node>('.node')
      .data(typedRoot.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(event, d);
        highlightPath(d);
      });

    // Staggered entrance
    node.style('opacity', 0).transition().delay((_d, i) => i * 15).duration(400).style('opacity', 1);

    // Node shapes
    node.each(function (d) {
      const el = d3.select(this);
      const r = nodeRadius(d);
      const color = nodeColor(d);
      const stable = isStable(d);
      const dead = isDead(d);
      const strokeColor = stable ? '#4ade80' : dead ? '#f87171' : '#3a3a55';
      const strokeW = stable ? 2.5 : dead ? 1.5 : 1;
      const strokeDash = dead ? '3,2' : 'none';

      // Hover ring
      el.append('circle')
        .attr('r', r + 6)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .on('mouseenter', function () { d3.select(this).attr('opacity', 1); })
        .on('mouseleave', function () { d3.select(this).attr('opacity', 0); });

      if (d.data.isScaffold) {
        el.append('rect')
          .attr('x', -r)
          .attr('y', -r)
          .attr('width', r * 2)
          .attr('height', r * 2)
          .attr('transform', 'rotate(45)')
          .attr('fill', color)
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeW)
          .attr('stroke-dasharray', strokeDash)
          .attr('opacity', dead ? 0.5 : 0.9);
      } else {
        el.append('circle')
          .attr('r', r)
          .attr('fill', color)
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeW)
          .attr('stroke-dasharray', strokeDash)
          .attr('opacity', dead ? 0.5 : 0.9);
      }

      // Stable glow
      if (stable) {
        el.append('circle')
          .attr('r', r + 4)
          .attr('fill', 'none')
          .attr('stroke', '#4ade80')
          .attr('stroke-width', 1)
          .attr('opacity', 0.3);
      }

      // Breathing ring for high-need
      if (d.data.need >= 7 && !stable) {
        const br = el.append('circle')
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('r', r)
          .attr('pointer-events', 'none');

        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'r');
        anim.setAttribute('values', `${r};${r + 10};${r}`);
        anim.setAttribute('dur', `${2.5 + Math.random() * 1.5}s`);
        anim.setAttribute('repeatCount', 'indefinite');
        br.node()?.appendChild(anim);

        const animOpacity = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        animOpacity.setAttribute('attributeName', 'opacity');
        animOpacity.setAttribute('values', '0;0.15;0');
        animOpacity.setAttribute('dur', `${2.5 + Math.random() * 1.5}s`);
        animOpacity.setAttribute('repeatCount', 'indefinite');
        br.node()?.appendChild(animOpacity);
      }
    });

    // Labels
    node
      .append('text')
      .attr('x', (d) => nodeRadius(d) + 8)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'start')
      .text((d) => d.data.name)
      .attr('fill', (d) => {
        if (d.data.path === '.') return '#f0f0f8';
        if (isStable(d)) return '#4ade80';
        return '#c0c0d4';
      })
      .attr('font-weight', (d) => (d.data.path === '.' ? '700' : '400'))
      .attr('font-size', (d) => (d.data.path === '.' ? '14px' : '12px'))
      .attr('font-family', "'SF Mono','Fira Code','JetBrains Mono',monospace");

    // Conflict badge
    node
      .append('text')
      .attr('x', function (d) {
        const prev = this.previousSibling as SVGTextElement | null;
        const labelLen = prev?.getComputedTextLength() ?? 60;
        return nodeRadius(d) + 8 + labelLen + 6;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'start')
      .text((d) => (d.data.conflict > 0 ? `x:${d.data.conflict}` : ''))
      .attr('fill', '#fbbf24')
      .attr('font-size', '10px')
      .attr('opacity', 0.7);

    // Selection ring
    const selectionRing = g
      .append('circle')
      .attr('fill', 'none')
      .attr('stroke', '#60a5fa')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,3')
      .attr('opacity', 0)
      .attr('pointer-events', 'none');

    let selectionAnimFrame: number;

    function highlightPath(d: D3Node) {
      const ancestorSet = new Set<D3Node>();
      const ancestorLinks = new Set<string>();
      const chain = d.ancestors();
      chain.forEach((a) => ancestorSet.add(a));
      for (let i = 0; i < chain.length - 1; i++) {
        ancestorLinks.add(chain[i + 1].data.path + '→' + chain[i].data.path);
      }

      allLinks
        .attr('stroke', (l) =>
          ancestorLinks.has(l.source.data.path + '→' + l.target.data.path) ? '#60a5fa' : '#3a3a55',
        )
        .attr('stroke-width', (l) =>
          ancestorLinks.has(l.source.data.path + '→' + l.target.data.path) ? 2.5 : 1.5,
        );

      node.attr('opacity', (n) => (ancestorSet.has(n) ? 1 : 0.25));

      // Selection ring
      const r = nodeRadius(d) + 8;
      selectionRing.attr('cx', d.y).attr('cy', d.x).attr('r', r).attr('opacity', 0.7);

      if (selectionAnimFrame) cancelAnimationFrame(selectionAnimFrame);
      let offset = 0;
      (function spin() {
        offset = (offset + 0.3) % 100;
        selectionRing.attr('stroke-dashoffset', offset);
        selectionAnimFrame = requestAnimationFrame(spin);
      })();
    }

    function clearHighlight() {
      allLinks.attr('stroke', '#3a3a55').attr('stroke-width', 1.5);
      node.attr('opacity', 1);
      selectionRing.attr('opacity', 0);
      if (selectionAnimFrame) cancelAnimationFrame(selectionAnimFrame);
    }

    // Click background to deselect
    svg.on('click', () => {
      clearHighlight();
      onClearSelection();
    });

    // If there's already a selected path, highlight it
    if (selectedPath) {
      const target = typedRoot.descendants().find((d) => d.data.path === selectedPath);
      if (target) {
        highlightPath(target);
      }
    }

    return () => {
      if (selectionAnimFrame) cancelAnimationFrame(selectionAnimFrame);
    };
  }, [data, handleNodeClick, onClearSelection, selectedPath]);

  return <div ref={containerRef} className="w-full h-full" />;
}
