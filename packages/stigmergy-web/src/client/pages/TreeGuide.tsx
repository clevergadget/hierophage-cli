import { Link } from 'react-router-dom';

export function TreeGuide() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#f0f0f8] mb-2">The Tree</h1>
      <p className="text-sm text-[#8888a0] mb-8">
        How the specification tree works — nodes, signals, mutations, and convergence.
      </p>

      <Section title="Filesystem-Backed">
        <p>
          The tree is not a database. It's a directory structure on disk. Each node is a
          directory containing a <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">_node.md</code> file
          with YAML frontmatter (signals) and a markdown body (content). The root is{' '}
          <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">workspace/root.md</code>.
        </p>
        <p className="mt-3">
          This means the tree is human-readable, git-trackable, and tool-agnostic. You can
          open any node in a text editor, modify signals by hand, or diff two runs.
          The engine reads the filesystem on every operation — there's no cache to invalidate,
          no opaque data store to query. Debugging means{' '}
          <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">cat workspace/auth/_node.md</code>,
          not a database query.
        </p>
        <div className="mt-3 bg-[#1e1e32] border border-[#3a3a55] rounded p-3 text-xs font-mono text-[#a0a0b8]">
          <div>workspace/</div>
          <div className="ml-4">root.md</div>
          <div className="ml-4">user-flows/</div>
          <div className="ml-8">_node.md</div>
          <div className="ml-8">authentication/</div>
          <div className="ml-12">_node.md</div>
          <div className="ml-12">login-flow/</div>
          <div className="ml-16">_node.md</div>
          <div className="ml-4">architecture/</div>
          <div className="ml-8">_node.md</div>
          <div className="ml-8">...</div>
        </div>
        <Future>
          <strong>In-Memory Cache with Filesystem Sync</strong> — The engine currently does
          a full recursive filesystem walk on every pulse via <code>scanTree()</code>. This
          is fine up to ~500 nodes, but beyond that it becomes a bottleneck. The path forward
          is an in-memory tree cache that syncs lazily with the filesystem — fast reads during
          a run, with periodic flushes and conflict detection for external edits. The filesystem
          remains the source of truth, but the hot path avoids I/O.
        </Future>
      </Section>

      <Section title="Anatomy of a Node">
        <p>
          Every node carries the same structure — like cells in an organism, each one contains
          the same basic machinery. Click any node in the{' '}
          <Link to="/viz" className="text-blue-400 hover:text-blue-300 underline">
            Tree Visualization
          </Link>{' '}
          to inspect it.
        </p>

        <div className="mt-4 space-y-3">
          <Field name="Name" desc="Human-readable label, derived from the directory name." />
          <Field name="Path" desc="Position in the tree, like 'user-flows/authentication/login-flow'. The directory structure IS the tree structure — no serialization, no impedance mismatch." />
          <Field
            name="Signals (Pheromones)"
            desc="The three values that guide all agent behavior — named after the chemical signals that ants, slime molds, and termites use to coordinate."
          >
            <div className="mt-2 grid grid-cols-3 gap-2">
              <SignalCard name="Need" color="#f87171" emoji="0-10">
                How urgently this node needs work. Like a strong pheromone trail —
                high need attracts agents here.
              </SignalCard>
              <SignalCard name="Confidence" color="#4ade80" emoji="0-10">
                How implementable this node is. High confidence means an engineer
                could build from this spec.
              </SignalCard>
              <SignalCard name="Conflict" color="#fbbf24" emoji="0-10">
                Problems detected by{' '}
                <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Scouts</Link>,
                overlap detection, or coverage failures. Cleared by the{' '}
                <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Resolver</Link>.
              </SignalCard>
            </div>
          </Field>
          <Field name="Evidence" desc="Heuristic quality counters: acceptance criteria, examples, and risks mentioned in the content. Used by the Scout to detect hollow nodes — content that looks substantial but has no actionable detail." />
          <Field name="Content" desc="The markdown body — the actual specification text. This is what agents read, write, and refine. It's what a human or code generator would eventually build from." />
          <Field name="Scaffold" desc="Pre-built structural nodes created during initialization (e.g., 'user-flows', 'architecture', 'testing'). They get a priority boost to ensure the colony explores all important dimensions early — like scout ants fanning out to map the territory." />
        </div>
      </Section>

      <Section title="Priority & Target Selection">
        <p>
          Each pulse, the engine selects the highest-priority node — just like ants
          following the strongest pheromone trail. Priority is calculated as:
        </p>
        <div className="mt-3 bg-[#1e1e32] border border-[#3a3a55] rounded p-4 text-center">
          <code className="text-sm text-[#e0e0ec]">
            need × 2 − confidence + conflict × 0.5 + scaffold_boost − depth × 0.5
          </code>
        </div>
        <div className="mt-3 space-y-2 text-xs text-[#a0a0b8]">
          <p><strong className="text-[#e0e0ec]">need × 2</strong> — Need is the strongest attractor. High-need nodes get attention first.</p>
          <p><strong className="text-[#e0e0ec]">− confidence</strong> — Already-confident nodes are deprioritized. Don't fix what isn't broken.</p>
          <p><strong className="text-[#e0e0ec]">+ conflict × 0.5</strong> — Conflict nodes attract attention, but less than raw need.</p>
          <p><strong className="text-[#e0e0ec]">+ scaffold_boost</strong> — Scaffold nodes get a small boost to ensure structural coverage early on.</p>
          <p><strong className="text-[#e0e0ec]">− depth × 0.5</strong> — Deeper nodes are slightly deprioritized. This prevents "gravity wells" where one deep branch monopolizes the queue forever. It's a gradient, not a hard limit — a deep node with need:10 can still beat a shallow node with need:3.</p>
        </div>
        <p className="mt-3">
          In parallel mode, the engine selects N highest-priority nodes that are <em>not siblings</em>,
          to minimize mutation conflicts between concurrent agents. This is like ants naturally
          spreading out to cover more ground rather than all crowding the same path.
        </p>
        <Future>
          <strong>Incremental Scanning for Large Trees</strong> — Currently, priority
          calculation requires scanning every node in the tree on every pulse. At 500+ nodes,
          this becomes expensive. Incremental scanning would track which nodes changed since
          the last scan and only recalculate priority for affected subtrees. The branchMap
          (used for overlap detection) already caps at 200 lines, so FlashSpore's context
          stays bounded regardless of tree size — it's the scanner that needs optimization.
        </Future>
      </Section>

      <Section title="Mutations">
        <p>
          All changes to the tree go through a single <strong>MutationDispatcher</strong> — a
          Redux-style state machine that validates, applies, and logs every change. Every mutation
          is appended to <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">mutations.log</code>,
          creating an immutable audit trail. This is the{' '}
          <Link to="/concepts" className="text-blue-400 hover:text-blue-300 underline">
            persistent trace
          </Link>{' '}
          — like pheromone deposits that never fully evaporate.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MutationCard type="CREATE_NODE" color="#60a5fa">
            Agent decomposes a concept into sub-nodes. Creates a new directory with initial
            signals and content. This is how the colony grows — like spores colonizing
            new substrate.
          </MutationCard>
          <MutationCard type="UPDATE_CONTENT" color="#fbbf24">
            Agent rewrites or deepens a node's specification text. The core mechanism
            for improving quality — like ants reinforcing a trail.
          </MutationCard>
          <MutationCard type="UPDATE_SIGNALS" color="#a78bfa">
            Adjusts pheromone values. Used by maintenance agents, propagation, and the
            nudge system. Changes what attracts future agents.
          </MutationCard>
          <MutationCard type="DELETE_NODE" color="#f87171">
            Removes a dead or redundant node. Used by the{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Grazer</Link>{' '}
            during necrophoresis — like ants carrying dead colony members out of the nest.
          </MutationCard>
          <MutationCard type="MERGE_NODES" color="#c084fc">
            Atomic operation: update a target node with synthesized content, then delete
            the source nodes. Used by the{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Synthesizer</Link>{' '}
            to merge semantic duplicates — like slime mold tendrils fusing when they meet.
          </MutationCard>
        </div>
        <Future>
          <strong>Subtree Relocation</strong> — Currently, overlap detection flags nodes
          that semantically belong in a different branch, but the only fix is manual
          restructuring or Resolver rewriting. A Relocator agent could move an entire subtree
          (preserving children) to its correct branch, then let the ecology repair any
          inconsistencies. The tree would literally self-organize — not just grow and prune,
          but rearrange its own structure.
        </Future>
      </Section>

      <Section title="Stability & Convergence">
        <p>
          A node is <strong>stable</strong> when:
        </p>
        <div className="mt-2 bg-[#1e1e32] border border-green-500/20 rounded p-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-green-400">need ≤ 2</span>
            <span className="text-[#707088]">— not urgently needed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">confidence ≥ 8</span>
            <span className="text-[#707088]">— implementable content</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">conflict ≤ 1</span>
            <span className="text-[#707088]">— no unresolved problems</span>
          </div>
        </div>
        <p className="mt-3">
          The run terminates when <em>every node's highest priority</em> falls below
          the stability threshold. But stability is verified by an LLM —
          the{' '}
          <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">
            Verifier
          </Link>{' '}
          checks whether "stable-looking" nodes are truly implementable,
          and knocks back nodes that aren't. This prevents the tree from falsely
          converging on shallow content — like a quality inspector on a production line.
        </p>
        <p className="mt-2">
          Parent nodes only inherit stability from children after passing a{' '}
          <strong>coverage gate</strong> — an LLM check that children actually cover the
          parent's scope. This prevents premature convergence where children miss key aspects.
          Stability flows <em>upward</em> through the tree, from leaves to root, with
          verification at every level.
        </p>
        <Future>
          <strong>Incremental Crystallization</strong> — Currently, the{' '}
          <code>stig crystallize</code> command generates specification documents only after
          the entire tree is stable. But stable branches shouldn't have to wait for unstable
          ones. Incremental crystallization would generate specs for settled subtrees while
          other branches continue evolving — making the Crystallizer a living part of the
          ecology rather than a post-processing step.
        </Future>
      </Section>

      <Section title="Temperature & Damping">
        <p>
          To prevent agents from hammering the same node repeatedly, each node has a
          "temperature" — a mutation count per run. When a node exceeds the temperature
          limit (default: 5 mutations), further mutations are blocked and the node gets
          nudged away from the priority queue.
        </p>
        <p className="mt-3">
          This forces exploration breadth — like how an ant pheromone trail eventually saturates
          and ants start exploring alternative paths. Without damping, one high-need node
          would receive every pulse. With it, the colony naturally spreads its attention across
          the tree.
        </p>
        <p className="mt-2 text-[#a0a0b8]">
          When a node is overheated and no mutations succeed, both signals get nudged:
          confidence goes up, need goes down. This was a hard-won bug fix — nudging only
          confidence created stuck states where nodes had need:9 and confidence:10 simultaneously.
        </p>
      </Section>

      <Section title="Visual Guide">
        <p>
          In the{' '}
          <Link to="/viz" className="text-blue-400 hover:text-blue-300 underline">
            Tree Visualization
          </Link>
          , each node's appearance tells you its state at a glance:
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-[#a0a0b8]">
          <li><span className="inline-block w-3 h-3 rounded-full bg-red-400 align-middle mr-2" />Red nodes have low confidence — they need work</li>
          <li><span className="inline-block w-3 h-3 rounded-full bg-green-400 align-middle mr-2" style={{ boxShadow: '0 0 6px #4ade8066' }} />Green glowing nodes are stable — they're done</li>
          <li><span className="inline-block w-3 h-3 rounded-full bg-amber-400 align-middle mr-2" />Yellow nodes have conflict — something needs resolving</li>
          <li><span className="inline-block w-3 h-3 rounded-full bg-[#c17a6a] align-middle mr-2" style={{ borderRadius: '2px', transform: 'rotate(45deg)' }} />Diamond shapes are scaffolds — structural nodes seeded at init</li>
          <li><span className="inline-block w-3 h-3 rounded-full border border-dashed border-red-400 opacity-60 align-middle mr-2" />Dashed outlines are dead/placeholder nodes — candidates for the Grazer</li>
          <li>Node <em>size</em> reflects need — urgent nodes are bigger, attracting your eye just like they attract agents</li>
          <li>Clicking a node highlights its ancestor chain in blue — showing the path from root to leaf</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-[#f0f0f8] mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
        {title}
      </h2>
      <div className="text-sm text-[#c0c0d4] leading-relaxed">{children}</div>
    </section>
  );
}

function Future({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-[#1a1a30] border border-dashed border-[#3a3a60] rounded p-3">
      <div className="text-[10px] text-[#7070a0] uppercase tracking-widest mb-2">Future Direction</div>
      <div className="text-xs text-[#9090aa] leading-relaxed">{children}</div>
    </div>
  );
}

function Field({ name, desc, children }: { name: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-3">
      <div className="text-sm font-semibold text-[#f0f0f8] mb-1">{name}</div>
      <div className="text-xs text-[#a0a0b8] leading-relaxed">{desc}</div>
      {children}
    </div>
  );
}

function SignalCard({ name, color, emoji, children }: { name: string; color: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161625] border border-[#3a3a55] rounded p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold" style={{ color }}>{name}</span>
        <span className="text-[9px] text-[#707088]">{emoji}</span>
      </div>
      <div className="text-[11px] text-[#9090a8] leading-relaxed">{children}</div>
    </div>
  );
}

function MutationCard({ type, color, children }: { type: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-3">
      <code className="text-xs font-semibold" style={{ color }}>{type}</code>
      <div className="text-[11px] text-[#a0a0b8] leading-relaxed mt-1">{children}</div>
    </div>
  );
}
