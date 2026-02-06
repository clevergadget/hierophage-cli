import { Link } from 'react-router-dom';

export function TreeGuide() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">The Tree</h1>
      <p className="text-sm text-slate-600 mb-8">
        How the specification tree works — nodes, signals, mutations, and convergence.
      </p>

      <Section title="Filesystem-Backed">
        <p>
          The tree is not a database. It's a directory structure on disk. Each node is a
          directory containing a <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-xs border border-slate-200">_node.md</code> file
          with YAML frontmatter (signals) and a markdown body (content). The root is{' '}
          <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-xs border border-slate-200">workspace/root.md</code>.
        </p>
        <p className="mt-3">
          This means the tree is human-readable, git-trackable, and tool-agnostic. You can
          open any node in a text editor, modify signals by hand, or diff two runs.
          The engine reads the filesystem on every operation — there's no cache to invalidate,
          no opaque data store to query. Debugging means{' '}
          <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-xs border border-slate-200">cat workspace/auth/_node.md</code>,
          not a database query.
        </p>
        <div className="mt-3 bg-white border border-slate-200 rounded p-4 text-xs font-mono text-slate-500 shadow-sm">
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
          <Link to="/viz" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">
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
              <SignalCard name="Need" color="#ef4444" emoji="0-10">
                How urgently this node needs work. Like a strong pheromone trail —
                high need attracts agents here.
              </SignalCard>
              <SignalCard name="Confidence" color="#16a34a" emoji="0-10">
                How implementable this node is. High confidence means an engineer
                could build from this spec.
              </SignalCard>
              <SignalCard name="Conflict" color="#d97706" emoji="0-10">
                Problems detected by{' '}
                <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">Scouts</Link>,
                overlap detection, or coverage failures. Cleared by the{' '}
                <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">Resolver</Link>.
              </SignalCard>
            </div>
          </Field>
          <Field
            name="Signal Evaporation"
            desc="Need and conflict decay on idle nodes during each maintenance cycle (need: −0.25, conflict: −0.08). Nodes that haven't been pulse targets in the last 10 pulses gradually lose urgency — like unused pheromone trails fading. Confidence never decays, because accumulated knowledge persists. This prevents stale signals from accumulating as noise and forces the colony to re-evaluate old decisions."
          />
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
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded p-4 text-center">
          <code className="text-sm text-slate-700 font-mono">
            need × 2 − confidence + conflict × 0.5 + scaffold_boost − depth × 0.5
          </code>
        </div>
        <div className="mt-3 space-y-2 text-xs text-slate-500">
          <p><strong className="text-slate-700">need × 2</strong> — Need is the strongest attractor. High-need nodes get attention first.</p>
          <p><strong className="text-slate-700">− confidence</strong> — Already-confident nodes are deprioritized. Don't fix what isn't broken.</p>
          <p><strong className="text-slate-700">+ conflict × 0.5</strong> — Conflict nodes attract attention, but less than raw need.</p>
          <p><strong className="text-slate-700">+ scaffold_boost</strong> — Scaffold nodes get a small boost to ensure structural coverage early on.</p>
          <p><strong className="text-slate-700">− depth × 0.5</strong> — Deeper nodes are slightly deprioritized. This prevents "gravity wells" where one deep branch monopolizes the queue forever. It's a gradient, not a hard limit — a deep node with need:10 can still beat a shallow node with need:3.</p>
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
          the last scan and only recalculate priority for affected subtrees. FlashSpore's context
          is already local (target + ancestors + siblings + top-level concepts), so it stays
          bounded regardless of tree size — it's the scanner that needs optimization.
        </Future>
      </Section>

      <Section title="Mutations">
        <p>
          All changes to the tree go through a single <strong>MutationDispatcher</strong> — a
          Redux-style state machine that validates, applies, and logs every change. Every mutation
          is appended to <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-xs border border-slate-200">mutations.log</code>,
          creating an immutable audit trail. This is the{' '}
          <Link to="/concepts" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">
            persistent trace
          </Link>{' '}
          — like pheromone deposits that never fully evaporate.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <MutationCard type="CREATE_NODE" color="#3b82f6">
            Agent decomposes a concept into sub-nodes. Creates a new directory with initial
            signals and content. This is how the colony grows — like spores colonizing
            new substrate.
          </MutationCard>
          <MutationCard type="UPDATE_CONTENT" color="#eab308">
            Agent rewrites or deepens a node's specification text. The core mechanism
            for improving quality — like ants reinforcing a trail.
          </MutationCard>
          <MutationCard type="UPDATE_SIGNALS" color="#a855f7">
            Adjusts pheromone values. Used by maintenance agents, propagation, and the
            nudge system. Changes what attracts future agents.
          </MutationCard>
          <MutationCard type="DELETE_NODE" color="#ef4444">
            Removes a dead or redundant node. Used by the{' '}
            <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">Grazer</Link>{' '}
            during necrophoresis — like ants carrying dead colony members out of the nest.
          </MutationCard>
          <MutationCard type="MERGE_NODES" color="#8b5cf6">
            Atomic operation: update a target node with synthesized content, then delete
            the source nodes. Used by the{' '}
            <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">Synthesizer</Link>{' '}
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
        <div className="mt-3 bg-green-50/50 border border-green-200 rounded p-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-green-700 font-medium">need ≤ 2</span>
            <span className="text-green-700/70">— not urgently needed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-700 font-medium">confidence ≥ 8</span>
            <span className="text-green-700/70">— implementable content</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-700 font-medium">conflict ≤ 1</span>
            <span className="text-green-700/70">— no unresolved problems</span>
          </div>
        </div>
        <p className="mt-3">
          The run terminates when <em>every node's highest priority</em> falls below
          the stability threshold. But stability is verified by an LLM —
          the{' '}
          <Link to="/agents" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">
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
        <p className="mt-2 text-slate-500 text-sm">
          When a node is overheated and no mutations succeed, both signals get nudged:
          confidence goes up, need goes down. This was a hard-won bug fix — nudging only
          confidence created stuck states where nodes had need:9 and confidence:10 simultaneously.
        </p>
      </Section>

      <Section title="Visual Guide">
        <p>
          In the{' '}
          <Link to="/viz" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2">
            Tree Visualization
          </Link>
          , each node's appearance tells you its state at a glance:
        </p>
        <ul className="mt-3 space-y-2 text-xs text-slate-500">
          <li className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-red-400 mr-2 shadow-sm" />Red nodes have low confidence — they need work</li>
          <li className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2 shadow-sm ring-2 ring-green-100" />Green glowing nodes are stable — they're done</li>
          <li className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-amber-400 mr-2 shadow-sm" />Yellow nodes have conflict — something needs resolving</li>
          <li className="flex items-center"><span className="inline-block w-3 h-3 rounded bg-indigo-400 mr-2 rotate-45 scale-75 shadow-sm" />Diamond shapes are scaffolds — structural nodes seeded at init</li>
          <li className="flex items-center"><span className="inline-block w-3 h-3 rounded-full border border-dashed border-slate-400 opacity-60 mr-2" />Dashed outlines are dead/placeholder nodes — candidates for the Grazer</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Node <em>size</em> reflects need — urgent nodes are bigger, attracting your eye just like they attract agents. Clicking a node highlights its ancestor chain in blue.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-serif font-semibold text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
        {title}
      </h2>
      <div className="text-sm text-slate-600 leading-relaxed max-w-2xl">{children}</div>
    </section>
  );
}

function Future({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 bg-slate-50 border border-dashed border-slate-300 rounded p-4">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-semibold">Future Direction</div>
      <div className="text-xs text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

function Field({ name, desc, children }: { name: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-1">{name}</div>
      <div className="text-xs text-slate-500 leading-relaxed mb-1">{desc}</div>
      {children}
    </div>
  );
}

function SignalCard({ name, color, emoji, children }: { name: string; color: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold text-slate-700">{name}</span>
        <span className="text-[10px] text-slate-400 bg-white border border-slate-100 px-1 rounded">{emoji}</span>
      </div>
      <div className="text-[11px] text-slate-500 leading-relaxed">{children}</div>
    </div>
  );
}

function MutationCard({ type, color, children }: { type: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-l-2 border-slate-200 shadow-sm rounded-r p-3" style={{ borderLeftColor: color }}>
      <code className="text-xs font-semibold" style={{ color: '#334155' }}>{type}</code>
      <div className="text-[11px] text-slate-500 leading-relaxed mt-1">{children}</div>
    </div>
  );
}
