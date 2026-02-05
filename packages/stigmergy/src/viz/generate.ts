import { scanTree, getTreeStats, getColonyPhase } from '../tree/scanner.js';
import { listChildren } from '../tree/node.js';
import type { StigNode } from '../types.js';

interface VizNode {
  name: string;
  path: string;
  need: number;
  confidence: number;
  conflict: number;
  isScaffold: boolean;
  isPlaceholder: boolean;
  content: string;
  children: VizNode[];
}

/**
 * Check if a node is a placeholder (minimal or boilerplate content).
 */
function isPlaceholder(node: StigNode): boolean {
  const content = (node.content ?? '').trim().toLowerCase();
  if (content.length < 20 && node.signals.confidence < 5) return true;
  const patterns = [/^tbd\.?$/i, /^todo\.?$/i, /^placeholder/i, /^decomposed from/i];
  return patterns.some((p) => p.test(content));
}

/**
 * Build a hierarchical tree structure from the flat node list.
 */
function buildHierarchy(workspacePath: string, nodes: StigNode[]): VizNode {
  const nodeMap = new Map<string, StigNode>();
  for (const n of nodes) {
    nodeMap.set(n.path, n);
  }

  function buildNode(node: StigNode): VizNode {
    const childPaths = listChildren(workspacePath, node.path);
    const children = childPaths
      .map((cp) => nodeMap.get(cp))
      .filter((n): n is StigNode => n !== undefined)
      .map(buildNode);

    return {
      name: node.name,
      path: node.path,
      need: node.signals.need,
      confidence: node.signals.confidence,
      conflict: node.signals.conflict,
      isScaffold: node.isScaffold,
      isPlaceholder: isPlaceholder(node),
      content: node.content,
      children,
    };
  }

  const root = nodes.find((n) => n.path === '.');
  if (!root) {
    return { name: 'empty', path: '.', need: 0, confidence: 0, conflict: 0, isScaffold: false, isPlaceholder: false, content: '', children: [] };
  }

  return buildNode(root);
}

/**
 * Generate a self-contained HTML file with D3.js tree visualization.
 */
export function generateVizHtml(workspacePath: string): string {
  const nodes = scanTree(workspacePath);
  const hierarchy = buildHierarchy(workspacePath, nodes);
  const stats = getTreeStats(nodes);
  const phase = getColonyPhase(stats);
  const placeholderCount = nodes.filter(isPlaceholder).length;

  const phaseColors: Record<string, string> = {
    germination: '#a78bfa',
    foraging: '#60a5fa',
    'brood-care': '#fbbf24',
    crystallization: '#4ade80',
  };
  const phaseColor = phaseColors[phase] || '#808090';

  const treeJson = JSON.stringify(hierarchy);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stigmergy Tree Visualizer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
    background: #0a0a0f;
    color: #c8c8d0;
    overflow: hidden;
  }

  /* ── Header ── */
  #header {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 56px;
    background: #12121a;
    border-bottom: 1px solid #2a2a3a;
    display: flex;
    align-items: center;
    padding: 0 24px;
    z-index: 100;
    gap: 32px;
  }
  #header h1 {
    font-size: 20px;
    font-weight: 700;
    color: #e0e0e8;
    letter-spacing: 2px;
  }
  .stat {
    font-size: 13px;
    color: #707080;
  }
  .stat .val { color: #c8c8d0; font-weight: 600; }
  .stat .good { color: #4ade80; }
  .stat .bad { color: #f87171; }

  /* ── Canvas ── */
  #canvas {
    position: fixed;
    top: 56px; left: 0; right: 340px; bottom: 0;
  }

  /* ── Sidebar ── */
  #sidebar {
    position: fixed;
    top: 56px; right: 0;
    width: 340px; bottom: 0;
    background: #12121a;
    border-left: 1px solid #2a2a3a;
    padding: 20px;
    overflow-y: auto;
  }
  #sidebar h2 {
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e8;
    margin-bottom: 8px;
  }
  #sidebar .path {
    font-size: 11px;
    color: #606070;
    margin-bottom: 16px;
    word-break: break-all;
  }
  .signal-bar {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    gap: 10px;
  }
  .signal-bar label {
    width: 86px;
    font-size: 11px;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .signal-bar .track {
    flex: 1;
    height: 8px;
    background: #1a1a2a;
    border-radius: 4px;
    overflow: hidden;
  }
  .signal-bar .fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }
  .signal-bar .num {
    width: 24px;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
  }
  .fill-need { background: #f87171; }
  .fill-confidence { background: #4ade80; }
  .fill-conflict { background: #fbbf24; }
  .num-need { color: #f87171; }
  .num-confidence { color: #4ade80; }
  .num-conflict { color: #fbbf24; }
  #context-chain {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #2a2a3a;
    overflow-y: auto;
    flex: 1;
  }
  .chain-node {
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid #1a1a2a;
  }
  .chain-node:last-child {
    border-bottom: none;
  }
  .chain-header {
    font-size: 11px;
    color: #909098;
    letter-spacing: 0.3px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chain-header .depth-tag {
    background: #1a1a2a;
    color: #606070;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .chain-header .chain-name {
    color: #b0b0b8;
  }
  .chain-signals {
    font-size: 10px;
    color: #505060;
    margin-bottom: 4px;
  }
  .chain-signals .s-need { color: #f87171; }
  .chain-signals .s-conf { color: #4ade80; }
  .chain-signals .s-conf-x { color: #fbbf24; }
  .chain-content {
    font-size: 11px;
    line-height: 1.5;
    color: #707080;
    white-space: pre-wrap;
    max-height: 80px;
    overflow: hidden;
  }
  .chain-node.chain-target .chain-header {
    font-size: 12px;
  }
  .chain-node.chain-target .chain-header .chain-name {
    color: #e0e0e8;
    font-weight: 600;
  }
  .chain-node.chain-target .chain-content {
    font-size: 13px;
    line-height: 1.6;
    color: #a0a0b0;
    max-height: none;
    overflow: visible;
  }
  .badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .badge-scaffold {
    background: #2563eb22;
    color: #60a5fa;
    border: 1px solid #2563eb44;
  }
  .badge-stable {
    background: #16a34a22;
    color: #4ade80;
    border: 1px solid #16a34a44;
  }
  .badge-dead {
    background: #dc262622;
    color: #f87171;
    border: 1px dashed #dc262644;
  }
  #empty-sidebar {
    color: #505060;
    font-size: 13px;
    margin-top: 60px;
    text-align: center;
    line-height: 1.8;
  }

  /* ── SVG ── */
  svg .link {
    fill: none;
    stroke: #2a2a3a;
    stroke-width: 1.5;
    transition: stroke 0.4s, stroke-width 0.4s, stroke-opacity 0.4s;
  }
  svg .link.link-highlight {
    stroke: #60a5fa;
    stroke-width: 2.5;
    stroke-opacity: 0.8;
  }
  svg .node { transition: opacity 0.3s; }
  svg .node.dimmed { opacity: 0.25; }
  svg .node .hover-ring {
    opacity: 0;
    transition: opacity 0.2s;
  }
  svg .node:hover .hover-ring { opacity: 1; }
  @keyframes breathe {
    0%, 100% { r: var(--base-r); opacity: 0; }
    50% { r: var(--breathe-r); opacity: 0.15; }
  }
  svg .breathe-ring {
    animation: breathe 3s ease-in-out infinite;
    fill: none;
    pointer-events: none;
  }
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }
  svg .node {
    animation: fadeSlideIn 0.5s ease-out backwards;
  }

  /* ── Legend ── */
  #legend {
    position: fixed;
    bottom: 0; left: 0;
    right: 340px;
    background: #12121a;
    border-top: 1px solid #2a2a3a;
    padding: 14px 24px;
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    z-index: 100;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #808090;
  }
  .legend-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-label { white-space: nowrap; }
  .legend-signals {
    font-size: 10px;
    color: #505060;
  }
</style>
</head>
<body>

<div id="header">
  <h1>STIGMERGY</h1>
  <span class="stat phase-badge" style="background:${phaseColor}22;color:${phaseColor};border:1px solid ${phaseColor}44;padding:2px 10px;border-radius:4px;font-weight:600">${phase.toUpperCase()}</span>
  <span class="stat">Nodes: <span class="val">${stats.total_nodes}</span></span>
  <span class="stat">Stable: <span class="val good">${stats.stable_count}</span></span>
  <span class="stat">Conflict: <span class="val ${stats.nodes_in_conflict > 0 ? 'bad' : ''}">${stats.nodes_in_conflict}</span></span>
  <span class="stat">Dead: <span class="val ${placeholderCount > 10 ? 'bad' : ''}">${placeholderCount}</span></span>
  <span class="stat">Avg conf: <span class="val">${stats.avg_confidence}</span></span>
</div>

<div id="canvas"></div>

<div id="sidebar">
  <div id="empty-sidebar">Click a node to inspect.<br><br>
    Scroll to zoom. Drag to pan.</div>
  <div id="node-detail" style="display:none; height:100%; display:flex; flex-direction:column;">
    <h2 id="node-name"></h2>
    <div class="path" id="node-path"></div>
    <div id="node-badges" style="margin-bottom:12px"></div>
    <div>
      <div class="signal-bar">
        <label>Need</label>
        <div class="track"><div class="fill fill-need" id="bar-need"></div></div>
        <span class="num num-need" id="val-need"></span>
      </div>
      <div class="signal-bar">
        <label>Confidence</label>
        <div class="track"><div class="fill fill-confidence" id="bar-confidence"></div></div>
        <span class="num num-confidence" id="val-confidence"></span>
      </div>
      <div class="signal-bar">
        <label>Conflict</label>
        <div class="track"><div class="fill fill-conflict" id="bar-conflict"></div></div>
        <span class="num num-conflict" id="val-conflict"></span>
      </div>
    </div>
    <div id="context-chain"></div>
  </div>
</div>

<div id="legend">
  <div class="legend-item">
    <div class="legend-dot" style="background:#f87171"></div>
    <div><span class="legend-label">Urgent</span><br><span class="legend-signals">need:8 conf:0</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#c17a6a"></div>
    <div><span class="legend-label">In progress</span><br><span class="legend-signals">need:6 conf:4</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#7db890"></div>
    <div><span class="legend-label">Mostly settled</span><br><span class="legend-signals">need:3 conf:7</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#4ade80; border: 2px solid #22c55e; box-shadow: 0 0 6px #4ade8066"></div>
    <div><span class="legend-label">Stable</span><br><span class="legend-signals">need:1 conf:9 (green glow)</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#fbbf24"></div>
    <div><span class="legend-label">Conflict</span><br><span class="legend-signals">conflict &gt; 2</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#c17a6a; border-radius:3px; transform:rotate(45deg)"></div>
    <div><span class="legend-label">Scaffold</span><br><span class="legend-signals">diamond shape</span></div>
  </div>
  <div class="legend-item">
    <div class="legend-dot" style="background:#c17a6a55; border:1.5px dashed #f87171; opacity:0.6"></div>
    <div><span class="legend-label">Dead</span><br><span class="legend-signals">placeholder/empty (dashed)</span></div>
  </div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const treeData = ${treeJson};

const canvas = document.getElementById('canvas');
const width = canvas.clientWidth;
const height = canvas.clientHeight;

// ── Color logic ──
function nodeColor(d) {
  const data = d.data;
  if (data.conflict > 2) return '#fbbf24';
  const t = data.confidence / 10;
  const r = Math.round(248 * (1 - t) + 74 * t);
  const g = Math.round(113 * (1 - t) + 222 * t);
  const b = Math.round(113 * (1 - t) + 128 * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function nodeRadius(d) {
  return Math.max(5, 4 + d.data.need * 0.8);
}

function isStable(d) {
  return d.data.confidence >= 8 && d.data.need <= 2 && d.data.conflict <= 1;
}

function isDead(d) {
  return d.data.isPlaceholder && !d.data.isScaffold;
}

// ── Build hierarchy (horizontal: x=vertical, y=horizontal) ──
const root = d3.hierarchy(treeData);

// Spacing: [vertical gap between siblings, horizontal depth gap]
const treeLayout = d3.tree().nodeSize([36, 220]);
treeLayout(root);

const svg = d3.select('#canvas')
  .append('svg')
  .attr('width', width)
  .attr('height', height);

const g = svg.append('g');

// Zoom + pan
const zoom = d3.zoom()
  .scaleExtent([0.15, 3])
  .on('zoom', (e) => g.attr('transform', e.transform));
svg.call(zoom);

// Initial position: offset so root is visible at left-center
const startX = 80;
const startY = height / 2;
svg.call(zoom.transform, d3.zoomIdentity.translate(startX, startY));

// ── Links (horizontal: swap x/y) ──
g.selectAll('.link')
  .data(root.links())
  .join('path')
  .attr('class', 'link')
  .attr('d', d3.linkHorizontal()
    .x(d => d.y)
    .y(d => d.x));

// ── Nodes ──
const node = g.selectAll('.node')
  .data(root.descendants())
  .join('g')
  .attr('class', 'node')
  .attr('transform', d => 'translate(' + d.y + ',' + d.x + ')')
  .style('cursor', 'pointer')
  .on('click', (e, d) => showDetail(d));

// Staggered entrance delay
node.each(function(d, i) {
  d3.select(this).style('animation-delay', (i * 15) + 'ms');
});

// Node shapes
node.each(function(d) {
  const el = d3.select(this);
  const r = nodeRadius(d);
  const color = nodeColor(d);
  const stable = isStable(d);
  const dead = isDead(d);
  const strokeColor = stable ? '#4ade80' : dead ? '#f87171' : '#2a2a3a';
  const strokeW = stable ? 2.5 : dead ? 1.5 : 1;
  const strokeDash = dead ? '3,2' : 'none';

  // Hover ring (behind everything)
  el.append('circle')
    .attr('class', 'hover-ring')
    .attr('r', r + 6)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1.5);

  if (d.data.isScaffold) {
    el.append('rect')
      .attr('class', 'main-shape')
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
      .attr('class', 'main-shape')
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

  // Breathing ring for high-need nodes
  if (d.data.need >= 7 && !stable) {
    const br = el.append('circle')
      .attr('class', 'breathe-ring')
      .attr('stroke', color)
      .attr('stroke-width', 1);
    br.style('--base-r', r + 'px');
    br.style('--breathe-r', (r + 10) + 'px');
    br.attr('r', r);
    // Use SMIL for reliable radius animation
    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    anim.setAttribute('attributeName', 'r');
    anim.setAttribute('values', r + ';' + (r + 10) + ';' + r);
    anim.setAttribute('dur', (2.5 + Math.random() * 1.5) + 's');
    anim.setAttribute('repeatCount', 'indefinite');
    br.node().appendChild(anim);
  }
});

// ── Labels: to the right of nodes, vertically centered ──
node.append('text')
  .attr('x', d => nodeRadius(d) + 8)
  .attr('dy', '0.35em')
  .attr('text-anchor', 'start')
  .text(d => d.data.name)
  .attr('fill', d => {
    if (d.data.path === '.') return '#e0e0e8';
    if (isStable(d)) return '#4ade80';
    return '#a0a0b0';
  })
  .attr('font-weight', d => d.data.path === '.' ? '700' : '400')
  .attr('font-size', d => d.data.path === '.' ? '14px' : '12px')
  .attr('font-family', "'SF Mono','Fira Code','JetBrains Mono',monospace");

// Mini signal badge next to label
node.append('text')
  .attr('x', function(d) {
    // Position after the label
    const labelEl = this.previousSibling;
    const labelLen = labelEl ? labelEl.getComputedTextLength() : 60;
    return nodeRadius(d) + 8 + labelLen + 6;
  })
  .attr('dy', '0.35em')
  .attr('text-anchor', 'start')
  .text(d => {
    const s = d.data;
    const parts = [];
    if (s.conflict > 0) parts.push('x:' + s.conflict);
    return parts.length ? parts.join(' ') : '';
  })
  .attr('fill', '#fbbf24')
  .attr('font-size', '10px')
  .attr('opacity', 0.7);

// ── Path highlighting ──
const allLinks = g.selectAll('.link');

function highlightPath(d) {
  const ancestorSet = new Set();
  const ancestorLinks = new Set();
  const chain = d.ancestors();
  chain.forEach(a => ancestorSet.add(a));
  // Build set of link source→target pairs in the chain
  for (let i = 0; i < chain.length - 1; i++) {
    ancestorLinks.add(chain[i + 1].data.path + '→' + chain[i].data.path);
  }

  // Highlight links on the path
  allLinks.classed('link-highlight', l => {
    return ancestorLinks.has(l.source.data.path + '→' + l.target.data.path);
  });

  // Dim non-ancestor nodes
  node.classed('dimmed', n => !ancestorSet.has(n));
}

function clearHighlight() {
  allLinks.classed('link-highlight', false);
  node.classed('dimmed', false);
}

// ── Selection ring ──
const selectionRing = g.append('circle')
  .attr('class', 'selection-ring')
  .attr('fill', 'none')
  .attr('stroke', '#60a5fa')
  .attr('stroke-width', 2)
  .attr('stroke-dasharray', '4,3')
  .attr('opacity', 0)
  .attr('pointer-events', 'none');

let selectionAnim;
function animateSelection(d) {
  const r = nodeRadius(d) + 8;
  selectionRing
    .attr('cx', d.y)
    .attr('cy', d.x)
    .attr('r', r)
    .attr('opacity', 0.7);
  // Gentle rotation via dashoffset
  if (selectionAnim) cancelAnimationFrame(selectionAnim);
  let offset = 0;
  (function spin() {
    offset = (offset + 0.3) % 100;
    selectionRing.attr('stroke-dashoffset', offset);
    selectionAnim = requestAnimationFrame(spin);
  })();
}

// ── Sidebar detail ──
function showDetail(d) {
  const data = d.data;
  document.getElementById('empty-sidebar').style.display = 'none';
  const detail = document.getElementById('node-detail');
  detail.style.display = 'flex';
  document.getElementById('node-name').textContent = data.name;
  document.getElementById('node-path').textContent = data.path === '.' ? '(root)' : data.path;

  let badges = '';
  if (data.isScaffold) badges += '<span class="badge badge-scaffold">scaffold</span>';
  if (isStable(d)) badges += '<span class="badge badge-stable">stable</span>';
  if (isDead(d)) badges += '<span class="badge badge-dead">dead</span>';
  document.getElementById('node-badges').innerHTML = badges;

  document.getElementById('bar-need').style.width = (data.need * 10) + '%';
  document.getElementById('val-need').textContent = data.need;
  document.getElementById('bar-confidence').style.width = (data.confidence * 10) + '%';
  document.getElementById('val-confidence').textContent = data.confidence;
  document.getElementById('bar-conflict').style.width = (data.conflict * 10) + '%';
  document.getElementById('val-conflict').textContent = data.conflict;

  // Highlight path on graph
  highlightPath(d);
  animateSelection(d);

  // Build context chain: root → ... → target
  const chain = d.ancestors().reverse();
  const chainEl = document.getElementById('context-chain');
  let html = '';

  for (let i = 0; i < chain.length; i++) {
    const a = chain[i].data;
    const isTarget = i === chain.length - 1;
    const depthLabel = i === 0 ? 'ROOT' : 'DEPTH ' + i;

    html += '<div class="chain-node' + (isTarget ? ' chain-target' : '') + '">';
    html += '<div class="chain-header">';
    html += '<span class="depth-tag">' + depthLabel + '</span> ';
    html += '<span class="chain-name">' + escapeHtml(a.name) + '</span>';
    if (a.isScaffold) html += ' <span class="badge badge-scaffold">scaffold</span>';
    html += '</div>';
    html += '<div class="chain-signals">';
    html += '<span class="s-need">n:' + a.need + '</span> ';
    html += '<span class="s-conf">c:' + a.confidence + '</span>';
    if (a.conflict > 0) html += ' <span class="s-conf-x">x:' + a.conflict + '</span>';
    html += '</div>';
    if (a.content) {
      html += '<div class="chain-content">' + escapeHtml(a.content) + '</div>';
    }
    html += '</div>';
  }

  // Siblings of the target
  if (d.parent && d.parent.children && d.parent.children.length > 1) {
    const siblings = d.parent.children.filter(s => s !== d);
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #2a2a3a;">';
    html += '<div style="font-size:10px;color:#606070;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Siblings</div>';
    for (const s of siblings) {
      const sc = nodeColor(s);
      html += '<div style="font-size:11px;color:#707080;margin-bottom:4px;cursor:pointer;" onclick="clickSibling(event)">';
      html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + sc + ';margin-right:6px;vertical-align:middle;"></span>';
      html += escapeHtml(s.data.name);
      html += ' <span style="font-size:10px;color:#505060;">n:' + s.data.need + ' c:' + s.data.confidence + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  chainEl.innerHTML = html;
  chainEl.scrollTop = chainEl.scrollHeight;
}

// Click background to deselect
svg.on('click', function(e) {
  if (e.target === this || e.target === svg.node()) {
    clearHighlight();
    selectionRing.attr('opacity', 0);
    if (selectionAnim) cancelAnimationFrame(selectionAnim);
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
</script>
</body>
</html>`;
}
