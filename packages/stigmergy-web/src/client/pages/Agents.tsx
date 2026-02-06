import { Link } from 'react-router-dom';

export function Agents() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#f0f0f8] mb-2">The Agents</h1>
      <p className="text-sm text-[#8888a0] mb-8">
        The organisms that inhabit the tree — what each one does and when it acts.
      </p>

      <Section title="How Agents Work">
        <p>
          Agents are stateless functions. They have no memory of past runs, no knowledge of
          each other, no global state. Each one receives a target node, its context chain
          (ancestors + siblings), and colony-level information (phase, stats, branch map).
          They return a list of mutations. The{' '}
          <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300 underline">
            MutationDispatcher
          </Link>{' '}
          validates and applies them.
        </p>
        <p className="mt-3">
          This is the{' '}
          <Link to="/concepts" className="text-blue-400 hover:text-blue-300 underline">
            stigmergic principle
          </Link>{' '}
          in action: all knowledge lives in the tree itself — the signals and content that
          previous agents left behind. Agents coordinate through the environment, not through
          messages. Just like ants that have never met can cooperate on building a nest,
          these agents cooperate on building a specification.
        </p>
        <p className="mt-3 text-[#a0a0b8]">
          The design doc puts it well: "These are species, not microservices." Each agent
          occupies a distinct ecological niche. FlashSpore grows. Scout patrols. Grazer prunes.
          Verifier quality-checks. The ecology works because the niches are complementary.
        </p>
      </Section>

      {/* Primary Agent */}
      <AgentCard
        name="FlashSpore"
        role="The Primary Worker"
        emoji="🍄"
        color="#60a5fa"
        frequency="Every pulse"
        model="gemini-2.5-flash-lite"
      >
        <p>
          Named after fungal spore dispersal — FlashSpore colonizes the tree, spreading
          structure wherever it lands. It receives the highest-priority node, reads its
          context (parent chain + siblings + colony phase), and decides what to do:
        </p>
        <div className="mt-3 space-y-2">
          <Action name="DECOMPOSE" color="#60a5fa">
            Break a broad concept into specific sub-nodes. Creates 2–5 children with
            initial content and signals. Dominant in germination/foraging phases.
          </Action>
          <Action name="REVIEW" color="#a78bfa">
            Read the existing content critically. Add acceptance criteria, examples,
            risk considerations. Raises confidence without adding children.
          </Action>
          <Action name="UPDATE_CONTENT" color="#fbbf24">
            Rewrite or deepen the node's specification. More substantial than REVIEW —
            may restructure the content entirely.
          </Action>
          <Action name="SETTLE" color="#4ade80">
            Declare the node implementable. Drops need to 1, raises confidence to 9.
            Only chosen when the agent judges the spec is genuinely ready for an engineer.
          </Action>
        </div>
        <p className="mt-3 text-[#a0a0b8]">
          FlashSpore uses structured JSON output — the model returns a typed response with
          action, mutations, reasoning, and optional{' '}
          <Link to="/concepts" className="text-blue-400 hover:text-blue-300 underline">
            overlap reports
          </Link>. Phase guidance in the system prompt steers behavior as the colony evolves —
          aggressive decomposition early, refinement and settling later.
        </p>
        <div className="mt-3 bg-[#161625] border border-[#3a3a55] rounded p-3">
          <div className="text-[10px] text-[#707088] uppercase tracking-wider mb-2">Cross-Branch Overlap Detection (Scent Trails)</div>
          <p className="text-[11px] text-[#a0a0b8]">
            Every FlashSpore call includes a lightweight <strong>branch map</strong> — a ~300-token
            outline of all branches and their node names. Like a scent map of the colony's territory,
            this lets the agent spot semantic overlaps across branches
            (e.g., "Create Task" in user-flows vs "Task Creation" in architecture) without ever
            seeing the full tree. Overlaps raise conflict on both nodes, attracting the Resolver or
            Synthesizer. This replaced a centralized Weaver agent that violated the local-context-only
            principle — distributing detection into FlashSpore's normal work is more truly stigmergic.
          </p>
        </div>
      </AgentCard>

      <AgentCard
        name="MockSpore"
        role="The Test Double"
        emoji="🧪"
        color="#a0a0b8"
        frequency="Dry runs only"
        model="None (deterministic)"
      >
        <p>
          A deterministic mock that produces predictable mutations for testing.
          Used when you run with <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">--dry-run</code>.
          Decomposes nodes into 2 children and marks content as reviewed.
          Zero API cost, instant execution — great for verifying the simulation loop
          without burning tokens.
        </p>
      </AgentCard>

      <div className="my-8 border-t border-[#3a3a55]" />
      <h2 className="text-lg font-semibold text-[#f0f0f8] mb-2">Maintenance Agents</h2>
      <p className="text-sm text-[#8888a0] mb-6">
        These agents run during the{' '}
        <strong className="text-[#a0a0b8]">maintenance cycle</strong> — every 10 pulses — not on
        individual nodes. They maintain tree health and drive convergence, like the immune system
        and cleanup crews of the colony. See their activity
        in the{' '}
        <Link to="/replay" className="text-blue-400 hover:text-blue-300 underline">
          Replay maintenance view
        </Link>.
      </p>

      <AgentCard
        name="Scout"
        role="Problem Detection"
        emoji="🐜"
        color="#fbbf24"
        frequency="Every 10 pulses"
        model="None (heuristic)"
      >
        <p>
          Like a scout ant patrolling the colony's perimeter, the Scout looks for problems
          that FlashSpore might not notice:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-[#a0a0b8]">
          <li><strong className="text-[#e0e0ec]">Hollow nodes</strong> — content exists but has no acceptance criteria, examples, or risks. Looks substantial, isn't. Raises conflict.</li>
          <li><strong className="text-[#e0e0ec]">Tautologies</strong> — node content just restates its name. "Authentication: This handles authentication." Raises conflict.</li>
          <li><strong className="text-[#e0e0ec]">Similar siblings</strong> — two children of the same parent with suspiciously similar names. Flags for potential merge by the Synthesizer.</li>
        </ul>
        <p className="mt-2">
          The Scout is purely heuristic — no LLM calls, no API cost. It's fast pattern matching
          that catches the most common LLM output pathologies. Cheap vigilance.
        </p>
      </AgentCard>

      <AgentCard
        name="Grazer"
        role="Necrophoresis (Dead Node Removal)"
        emoji="🧹"
        color="#f87171"
        frequency="Every 10 pulses"
        model="None (heuristic)"
      >
        <p>
          Named after the biological process where ants carry dead colony members out of the nest
          (necrophoresis — literally "carrying the dead"). The Grazer identifies and prunes nodes
          that are:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-[#a0a0b8]">
          <li>Placeholder content (less than 20 characters, or matches "TBD", "TODO", "placeholder")</li>
          <li>Stagnant (untouched after 10+ pulses, zero confidence, no children)</li>
          <li>Withered branches (deep, childless, alone — no siblings either)</li>
        </ul>
        <p className="mt-2">
          Pruning dead nodes keeps the tree healthy and the priority queue focused
          on real work. Like the Scout, this is heuristic — zero API cost.
        </p>
      </AgentCard>

      <AgentCard
        name="Verifier"
        role="LLM Quality Gates"
        emoji="🔬"
        color="#22c55e"
        frequency="Every 10 pulses"
        model="gemini-2.5-flash-lite"
      >
        <p>
          The Verifier is the colony's quality inspector — it prevents the tree from
          falsely converging on shallow content. Two critical checks:
        </p>
        <div className="mt-3 space-y-3">
          <div className="bg-[#161625] border border-[#3a3a55] rounded p-3">
            <div className="text-xs font-semibold text-green-400 mb-1">Stability Verification</div>
            <p className="text-[11px] text-[#a0a0b8]">
              For leaf nodes that <em>look</em> stable (signals meet thresholds), the Verifier
              asks the LLM: "Could an engineer implement this?" If not — if the spec is
              vague, contradictory, or missing critical details — the node gets knocked back:
              need +2, confidence −2. This prevents the tree from declaring victory on
              well-formatted but useless content.
            </p>
          </div>
          <div className="bg-[#161625] border border-[#3a3a55] rounded p-3">
            <div className="text-xs font-semibold text-green-400 mb-1">Coverage Assessment</div>
            <p className="text-[11px] text-[#a0a0b8]">
              Before a parent inherits stability from settled children, the Verifier asks:
              "Do these children actually cover the parent's scope?" If there are gaps —
              e.g., a "user flows" node has children for login and registration but nothing
              for logout — the parent gets conflict +2 and propagation is blocked. No free
              passes.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[#a0a0b8]">
          The Verifier is the reason the tree produces genuinely implementable specs, not just
          specs that <em>look</em> complete. It's the most expensive maintenance agent but
          still cheap at ~$0.001 per verification.
        </p>
      </AgentCard>

      <AgentCard
        name="Resolver"
        role="Conflict Resolution"
        emoji="🩹"
        color="#818cf8"
        frequency="Triggered by conflict density or phase gate"
        model="gemini-2.5-flash-lite"
      >
        <p>
          When nodes have conflict {'>'} 0 (raised by Scout, overlap detection, or coverage
          failures), the Resolver reads the conflict reasons and the node's content, then
          rewrites the content to address the issues. If successful, conflict drops to 0.
        </p>
        <p className="mt-2">
          Triggers:
        </p>
        <ul className="mt-1 space-y-1 text-xs text-[#a0a0b8]">
          <li>Entering crystallization phase with unresolved conflicts</li>
          <li>More than 5% of nodes in conflict</li>
          <li>Every 50 pulses (periodic sweep)</li>
        </ul>
        <p className="mt-2 text-[#a0a0b8]">
          Success rate is typically 50–60%. Failed resolutions leave the conflict for the
          next cycle, where more context may have accumulated — like a wound that needs
          more time to heal.
        </p>
      </AgentCard>

      <AgentCard
        name="Synthesizer"
        role="Semantic Deduplication"
        emoji="🧬"
        color="#c084fc"
        frequency="Every 10 pulses"
        model="gemini-2.5-flash-lite"
      >
        <p>
          LLMs love creating semantic duplicates: "Create Task" vs "Task Creation" vs "New Task Form."
          String heuristics miss these. The Synthesizer uses an LLM to detect semantic duplicates
          among siblings, then merges them with a{' '}
          <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300 underline">
            MERGE_NODES
          </Link>{' '}
          mutation — like slime mold tendrils that fuse when they meet, combining their resources.
        </p>
        <p className="mt-2 text-[#a0a0b8]">
          A key prompt lesson: you must explicitly tell the LLM what <em>not</em> to merge.
          "Create Task" and "Delete Task" are different operations — the prompt says so explicitly
          to prevent over-eager merging. The LLM's instinct is to compress;
          stigmergy requires granularity.
        </p>
      </AgentCard>

      <AgentCard
        name="GoalAnalyst"
        role="Initialization Intelligence"
        emoji="🔍"
        color="#f59e0b"
        frequency="Once, during init"
        model="gemini-2.5-flash-lite"
      >
        <p>
          When you initialize a workspace with <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">--analyze</code>,
          the GoalAnalyst reads the goal and identifies special concerns — areas that
          need early attention. These become scaffold nodes in the tree, giving the
          colony a head start on important dimensions. Without analysis, the engine uses
          5 static scaffolds: user-flows, architecture, testing, deployment, error-handling.
        </p>
      </AgentCard>

      <Section title="The Maintenance Cycle">
        <p>
          Every 10 pulses, the engine pauses normal pulsing and runs the maintenance
          cycle — the colony's housekeeping routine. Order matters:
        </p>
        <ol className="mt-3 space-y-2 text-xs text-[#a0a0b8]">
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">1.</span>
            <span><strong className="text-green-400">Verifier</strong> — Check stable-looking leaves for implementability (up to 3 per cycle)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">2.</span>
            <span><strong className="text-green-400">Propagation</strong> — Settled children push stability upward to parents (with coverage gate)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">2½</span>
            <span><strong className="text-amber-700">Evaporation</strong> — Decay need (−0.25) and conflict (−0.08) on idle nodes. Confidence persists.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">3.</span>
            <span><strong className="text-amber-400">Scout</strong> — Detect hollow nodes, tautologies, similar siblings</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">4.</span>
            <span><strong className="text-red-400">Grazer</strong> — Prune dead nodes</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">5.</span>
            <span><strong className="text-indigo-400">Resolver</strong> — Resolve conflicts (when triggered)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-[#707088] font-semibold w-4 shrink-0">6.</span>
            <span><strong className="text-purple-400">Synthesizer</strong> — Merge semantic duplicates</span>
          </li>
        </ol>
        <p className="mt-3">
          This order matters. Verification first ensures we don't propagate false stability.
          Scouting after propagation catches issues introduced by signal changes. Pruning
          before resolution removes dead weight. Resolution and synthesis clean up what remains.
        </p>
        <p className="mt-2">
          Watch the maintenance cycle in real time during a{' '}
          <Link to="/run" className="text-blue-400 hover:text-blue-300 underline">
            live run
          </Link>{' '}
          or review past cycles in{' '}
          <Link to="/replay" className="text-blue-400 hover:text-blue-300 underline">
            Replay
          </Link>.
        </p>
        <Future>
          <strong>Adaptive Maintenance Scheduling</strong> — Currently maintenance runs on a
          fixed timer (every 10 pulses) regardless of tree state. A colony that's 90% stable
          doesn't need the same maintenance frequency as one that's actively growing. The system
          should adapt: run Scout more when conflict density is rising, run Synthesizer more when
          duplicate rate is high, skip maintenance entirely when the tree hasn't changed much.
          Condition-triggered scheduling beats clock-triggered — and it's more biologically
          accurate. Real colonies don't patrol on a timer; they respond to need.
        </Future>
      </Section>

      <Section title="The Missing Species">
        <p>
          The current ecology works — trees converge, specs are implementable, costs are trivial.
          But there are agents we know need to exist. These aren't feature requests; they're
          missing ecological niches.
        </p>

        <Future>
          <strong>The Skeptic (Semantic Adversary)</strong> — The most important missing agent.
          FlashSpore grows. Scout checks structure. Verifier checks implementability. Nobody
          challenges <em>ideas</em>. You can specify real-time sync under a batch processing
          parent and nothing catches the logical contradiction. The Skeptic reads a node's
          content against its parent and siblings and attacks logical coherence: "You specified
          real-time sync under a batch processing parent." "These three requirements cannot
          coexist." It deposits typed conflict reasons (LOGICAL, SECURITY, ARCHITECTURAL) that
          the Resolver can address with full context. Without a semantic adversary, the system
          can converge on well-written nonsense.
        </Future>

        <Future>
          <strong>User Simulation Swarm</strong> — Persona agents ("Angry Admin", "Confused
          Newbie", "Security Auditor") that read the interface spec and try to mentally "use" it.
          They deposit Frustration Pheromones where the spec fails the persona — like an
          accessibility audit run by simulated users. The spec heatmap would show UX problems
          before a single line of code is written. Imagine a swarm of tiny simulated users
          stress-testing your spec for $0.02.
        </Future>

        <Future>
          <strong>Conflict Archaeology</strong> — Every conflict raised leaves a{' '}
          <code>conflict_reason</code>. Over time, this becomes a dataset of <em>why things
          break</em>. Trend analysis: "Coverage gaps happen 3x more in API branches." "Hollow
          nodes cluster at depth 4." A meta-agent that reads conflict patterns and evolves
          the swarm's own heuristics — the colony learning from its mistakes. Self-improving
          Scout rules that emerge from data rather than being hand-coded.
        </Future>

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

function AgentCard({
  name,
  role,
  emoji,
  color,
  frequency,
  model,
  children,
}: {
  name: string;
  role: string;
  emoji: string;
  color: string;
  frequency: string;
  model: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 bg-[#1e1e32] border border-[#3a3a55] rounded-lg p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-lg">{emoji}</span>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <h3 className="text-base font-semibold text-[#f0f0f8]">{name}</h3>
        <span className="text-xs text-[#8888a0]">— {role}</span>
      </div>
      <div className="flex gap-4 mb-3 text-[10px] text-[#707088] ml-6">
        <span>Frequency: {frequency}</span>
        <span>Model: {model}</span>
      </div>
      <div className="text-sm text-[#c0c0d4] leading-relaxed ml-6">{children}</div>
    </div>
  );
}

function Action({ name, color, children }: { name: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5"
        style={{ background: `${color}20`, color, borderColor: `${color}40` }}
      >
        {name}
      </span>
      <span className="text-xs text-[#a0a0b8]">{children}</span>
    </div>
  );
}
