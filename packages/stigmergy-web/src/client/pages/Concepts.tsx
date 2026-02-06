import { Link } from 'react-router-dom';

export function Concepts() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#f0f0f8] mb-2">What is Stigmergy?</h1>
      <p className="text-sm text-[#8888a0] mb-8">
        The foundational principle behind this engine — and why it works.
      </p>

      <Section title="The Thesis">
        <p>
          A swarm of cheap, small-model agents coordinating through environmental signals
          can produce <strong>better initial specifications</strong> than a single frontier model —
          faster, cheaper, and more complete.
        </p>
        <p className="mt-3">
          That's the claim. Not that small models are smarter. They aren't. But intelligence
          isn't the bottleneck in specification. <em>Coverage</em> is. A single model — no matter
          how capable — generates specs in one pass. It can't revisit weak areas, can't detect
          its own gaps, can't self-correct across branches. It produces a plausible document
          and moves on.
        </p>
        <p className="mt-3">
          This engine trades model intelligence for <strong>iterative depth</strong>. Hundreds
          of focused pulses, each targeting the weakest point in the tree, with quality gates
          that reject shallow work. The result: specs where every leaf node has been reviewed,
          challenged, and verified as implementable — for a fraction of the cost of a single
          Claude Opus or GPT-4 call.
        </p>
        <div className="mt-4 bg-[#1e1e32] border border-[#3a3a55] rounded p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-green-400">~$0.06</div>
              <div className="text-[10px] text-[#707088] mt-1">200-pulse run cost</div>
            </div>
            <div>
              <div className="text-lg font-bold text-blue-400">106</div>
              <div className="text-[10px] text-[#707088] mt-1">verified review passes</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-400">49</div>
              <div className="text-[10px] text-[#707088] mt-1">converged nodes</div>
            </div>
          </div>
          <div className="text-[10px] text-[#606078] text-center mt-3">
            From an actual run against "Build a task management app" — 3 minutes wall time
          </div>
        </div>
      </Section>

      <Section title="Stigmergy in Nature">
        <p>
          Before we explain the engine, let's talk about the biology — because our terminology
          comes directly from it, and it's genuinely fascinating.
        </p>
        <p className="mt-3">
          <strong>Stigmergy</strong> (from the Greek <em>stigma</em> "mark" + <em>ergon</em> "work")
          is how organisms coordinate complex behavior without a central plan. No single individual
          knows the blueprint. Instead, each organism reads <em>signals left in the environment</em> by
          others, and responds locally. Structure emerges from thousands of simple decisions.
        </p>

        <div className="mt-4 space-y-3">
          <BioExample name="Ant Colonies" emoji="🐜">
            The classic example. Ants lay pheromone trails when they find food. Other ants follow
            strong trails and reinforce them. Weak trails evaporate. The colony discovers optimal
            foraging paths without any ant understanding the network — just follow the strongest scent,
            lay your own. This is why we call our node signals <strong>"pheromones"</strong> and why
            agents <strong>"forage"</strong> the tree.
          </BioExample>

          <BioExample name="Slime Molds" emoji="🟡">
            <em>Physarum polycephalum</em> — a single-celled organism with no brain — can solve
            mazes, optimize networks, and replicate the Tokyo rail system. Researchers placed food
            sources matching Tokyo's major cities and let the slime mold grow. It naturally formed
            a network almost identical to the actual rail layout, optimized for efficiency and
            redundancy. One cell. No neurons. Just local chemical signals and growth rules. Our
            engine works the same way: local agents, environmental signals, emergent structure.
          </BioExample>

          <BioExample name="Termite Mounds" emoji="🏗️">
            Termites build mounds with sophisticated thermoregulation — internal temperatures stay
            within 1°C despite 40°C swings outside. No architect. Each termite follows simple rules:
            if you smell high pheromone concentration, deposit mud here. The structure self-organizes
            through millions of local decisions. Our tree does the same: nodes with high need attract
            agents; agents build structure; the structure changes what gets built next.
          </BioExample>

          <BioExample name="Fungal Networks" emoji="🍄">
            Underground mycelial networks connect trees across forests, sharing nutrients and
            chemical signals — the "wood wide web." Spores disperse to colonize new territory.
            This is why our primary agent is called <strong>FlashSpore</strong>: it disperses
            into the tree, colonizing nodes and spreading structure. And the{' '}
            <strong>crystallization</strong> phase? That's from mineralogy — when a solution
            becomes saturated, crystals form as the structure locks in. Our tree crystallizes
            when specifications solidify into implementable form.
          </BioExample>
        </div>

        <div className="mt-4 bg-[#1e1e32] border border-[#3a3a55] rounded p-4">
          <div className="text-xs font-semibold text-[#e0e0ec] mb-2">Why the biological names?</div>
          <p className="text-xs text-[#a0a0b8] leading-relaxed">
            There's a tactical reason beyond accuracy. "Stigmergy" and "software" are not
            co-located in LLM training data. By forcing biological terminology into the
            codebase — pheromones, foraging, necrophoresis, brood care, crystallization —
            we drag biological thinking into every model that reads or modifies this code.
            When an LLM agent encounters a function called <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">necrophoresis()</code>{' '}
            instead of <code className="text-[#e0e0ec] bg-[#282845] px-1 rounded text-xs">cleanup()</code>,
            it activates associations with biological coordination, colony behavior, and
            emergent structure — exactly the mental model we want it operating with.
            The vocabulary is a form of <strong>prompt engineering at the source level</strong>.
          </p>
          <p className="text-xs text-[#a0a0b8] leading-relaxed mt-2">
            It also works on humans. Imagining little critters foraging across a tree, leaving
            scent trails, pruning dead branches — this engages the playful mind and sustains
            attention through hard engineering problems. A system that can be imagined can be
            lived in. A system that can be lived in will be maintained.
          </p>
        </div>
      </Section>

      <Section title="Why Not Just Ask an LLM to Write a Spec?">
        <p>
          A single LLM call produces a plausible-sounding spec, but it's shallow.
          It hallucinates details, misses edge cases, and can't self-correct.
          The spec <em>looks</em> complete but isn't — there's no mechanism to identify gaps.
        </p>
        <p className="mt-3">
          Stigmergy solves this through <strong>iterative refinement with quality gates</strong>.
          Each pulse focuses on the highest-priority node. Agents decompose broad concepts
          into specific ones, review and deepen content, and eventually settle nodes as
          implementable. The tree converges because the{' '}
          <Link to="/tree-guide" className="text-blue-400 hover:text-blue-300 underline">
            signal system
          </Link>{' '}
          drives attention where it's needed most.
        </p>
        <p className="mt-3">
          The key insight: <strong>you don't need a smart model to find gaps</strong>. You need
          a system that keeps looking. A $0.0003 agent that reviews a node and says "this has
          no acceptance criteria" is as useful as a $0.03 agent that writes perfect prose but
          only visits once.
        </p>
      </Section>

      <Section title="The Pheromone Model">
        <p>
          Every node in the tree carries three signals — the "pheromones" that agents
          read and modify. Just like ant pheromones that say "food this way" or "danger
          here," these numbers tell agents where attention is needed:
        </p>
        <div className="mt-3 space-y-3">
          <Signal name="Need" color="text-red-400" value="0-10">
            How urgently this node requires attention. High need attracts agents —
            like a strong pheromone trail attracting more ants.
            Newly created nodes start with high need. As content is written and children
            are created, need decreases.
          </Signal>
          <Signal name="Confidence" color="text-green-400" value="0-10">
            How settled and implementable this node is. Low confidence means the spec
            is vague or incomplete. High confidence means an engineer could build from it.
            Confidence rises as agents review and refine content.
          </Signal>
          <Signal name="Conflict" color="text-amber-400" value="0-10">
            Contradictions or problems detected. The{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">
              Scout
            </Link>{' '}
            raises conflict on hollow nodes and tautologies. Cross-branch overlap detection
            raises conflict when two nodes in different branches describe the same thing.
            The{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">
              Resolver
            </Link>{' '}
            clears conflicts by rewriting content.
          </Signal>
        </div>
        <p className="mt-4 text-[#a0a0b8]">
          These three numbers drive everything. Priority is calculated as:{' '}
          <code className="text-[#e0e0ec] bg-[#282845] px-1.5 py-0.5 rounded text-xs">
            need×2 − confidence + conflict×0.5 + scaffold_boost − depth×0.5
          </code>
          . The highest-priority node gets the next pulse. See them in action on the{' '}
          <Link to="/viz" className="text-blue-400 hover:text-blue-300 underline">
            Tree Visualization
          </Link>
          .
        </p>
        <Future>
          <strong>Signal Evaporation (Trace Decay)</strong> — In real ant colonies, unused
          pheromone trails fade over time. That's what makes the system adaptive — old paths
          disappear if they're not reinforced. Currently our signals persist forever. Adding
          evaporation — where signals on untouched nodes drift toward neutral every N pulses —
          would force re-evaluation of stale decisions and prevent the tree from fossilizing.
          This is fundamental to stigmergy and we know it needs to happen.
        </Future>
      </Section>

      <Section title="Colony Phases">
        <p>
          As the tree evolves, the colony passes through four phases — like an ant colony
          transitioning from exploration to nest-building, or a slime mold transitioning from
          search to network optimization. The phase changes agent behavior:
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <PhaseCard phase="germination" color="#a78bfa" threshold="avg confidence < 3">
            The tree is nearly empty. Agents aggressively decompose the goal into
            broad categories. Like spores landing on fresh substrate — wide dispersal,
            rapid colonization.
          </PhaseCard>
          <PhaseCard phase="foraging" color="#60a5fa" threshold="avg confidence 3–5">
            Structure exists but content is thin. Agents explore deeper branches
            and start filling in specifics. Like ants establishing trails to food sources —
            balanced exploration and exploitation.
          </PhaseCard>
          <PhaseCard phase="brood-care" color="#fbbf24" threshold="avg confidence 5–7">
            The tree has real content. Agents shift to nurturing — reviewing,
            deepening, and settling nodes. Like worker ants tending larvae — less
            exploration, more feeding and protection.
          </PhaseCard>
          <PhaseCard phase="crystallization" color="#4ade80" threshold="avg confidence ≥ 7">
            The tree is nearly stable. Agents make final adjustments, resolve
            remaining conflicts, and settle the last nodes. The specification
            solidifies into its final form — like a crystal locking in.
          </PhaseCard>
        </div>
        <p className="mt-4 text-[#a0a0b8]">
          Phase is determined automatically from average confidence across all nodes.
          Watch it change during a{' '}
          <Link to="/run" className="text-blue-400 hover:text-blue-300 underline">
            live run
          </Link>
          .
        </p>
        <Future>
          <strong>Phase Decoupling & Concurrent Agent Classes</strong> — Currently the colony
          moves through phases as a single unit: everyone forages, then everyone nurtures, then
          everyone crystallizes. But a real colony doesn't work like that — scout ants explore
          while builder ants build. The next major architecture change is decoupling phases so that
          different <em>branches</em> can be in different phases simultaneously. A mature branch
          at confidence 8 should be crystallizing while a new branch at confidence 2 is still
          being decomposed. This means running different agent classes in parallel — FlashSpore
          for growth, Verifier for quality, Resolver for conflicts — each targeting nodes in
          their appropriate phase, all at once. The priority formula already supports this
          implicitly; the phase guidance in the system prompt is the constraint to relax.
        </Future>
      </Section>

      <Section title="Why This Is Cheap">
        <p>
          The engine uses <strong>Gemini 2.5 Flash Lite</strong> — a model with absurd capacity:
        </p>
        <ul className="mt-2 space-y-1 text-[#a0a0b8]">
          <li>4,000 requests per minute, unlimited per day</li>
          <li>Input: $0.10/million tokens, Output: $0.40/million tokens</li>
          <li>A 200-pulse run costs roughly <strong className="text-[#e0e0ec]">$0.06</strong></li>
          <li>A 1,000-pulse run costs roughly <strong className="text-[#e0e0ec]">$0.30</strong></li>
        </ul>
        <p className="mt-3">
          This changes the design calculus entirely. LLM calls are not precious — they're
          abundant like CPU cycles. Run 8 agents in parallel. Retry freely. Let agents be
          verbose. The cost of a full specification tree is less than a cup of coffee.
        </p>
        <p className="mt-3">
          For comparison: a single Claude Opus call to write a spec might cost $0.15–$0.50
          and produce one document. For the same budget, this engine runs hundreds of
          focused operations with verification, conflict detection, and coverage checking.
          It's not a fair comparison — it's a different <em>kind</em> of process.
        </p>
      </Section>

      <Section title="The Result">
        <p>
          A stigmergic tree converges on a specification that is:
        </p>
        <ul className="mt-2 space-y-1 text-[#a0a0b8]">
          <li><strong className="text-[#e0e0ec]">Emergent</strong> — no human wrote the structure; it arose from local agent decisions, like a termite mound</li>
          <li><strong className="text-[#e0e0ec]">Verified</strong> — LLM quality gates check implementability and coverage</li>
          <li><strong className="text-[#e0e0ec]">Self-correcting</strong> — conflict detection and resolution run continuously, like a slime mold rerouting around obstacles</li>
          <li><strong className="text-[#e0e0ec]">Observable</strong> — every mutation is logged, every decision is traceable via{' '}
            <Link to="/replay" className="text-blue-400 hover:text-blue-300 underline">Replay</Link>
          </li>
        </ul>
        <p className="mt-3">
          The tree terminates when every node is <em>stable</em>: need ≤ 2, confidence ≥ 8,
          conflict ≤ 1. At that point, the spec is ready for a human engineer — or a code
          generation agent — to build from.
        </p>
        <Future>
          <strong>Spec-Driven Evolution (The Ribosome)</strong> — When a spec node reaches
          stability, a Builder agent generates a unit test and stub implementation in a sandbox.
          If the code passes, confidence is reinforced. If it fails, tension signals ripple
          back into the spec — like a biological feedback loop where the organism's environment
          shapes its evolution. The spec gets validated by reality. This closes the loop between
          specification and implementation and is the logical endpoint of the engine.
        </Future>
      </Section>

      <Section title="The Economic Moat">
        <p>
          Why does a swarm of cheap agents beat one expensive genius? Five reasons:
        </p>
        <div className="mt-3 space-y-3">
          <MoatPoint number={1} title="Cost structure inverts the usual constraint">
            200 pulses costs $0.06. 1,000 pulses costs $0.30. You can afford to let the system
            be wrong a hundred times and self-correct. Most AI systems optimize for getting it
            right in one shot because calls are expensive. We optimize for ecology — the aggregate
            is smart even when individuals are dumb.
          </MoatPoint>
          <MoatPoint number={2} title="Self-healing by default">
            A hallucination in a linear chat ruins the session. A hallucination in the swarm is
            a low-confidence node that gets eaten by a{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Grazer</Link>{' '}
            or flagged by a{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Scout</Link>.
            Error is not catastrophic — it's compost.
          </MoatPoint>
          <MoatPoint number={3} title="Infinite effective context">
            We don't stuff the context window. We navigate the graph. The project can grow to
            thousands of nodes, and agents only ever look at 5–10 at a time. There is no context
            window limit on the <em>system</em> — only on individual agents, and that's fine.
          </MoatPoint>
          <MoatPoint number={4} title="Parallelism is trivial">
            Run 8, 16, 32 concurrent agents. Each is independent. There's no orchestration graph
            to maintain, no dependency chain to manage. More agents = faster convergence = same cost.
          </MoatPoint>
          <MoatPoint number={5} title="The training data advantage">
            Most AI agent systems fight the model's instincts — extraction, summarization,
            compression. This system swims <em>with</em> them. The model's natural tendency toward
            helpful, structured, thorough output is the feature, not the bug. We're asking the LLM
            to do what it already wants to do: explain things carefully.
          </MoatPoint>
        </div>
      </Section>

      <Section title="What's Missing (Honest Assessment)">
        <p>
          The system works. Trees converge, specs are genuinely implementable, costs are
          trivial. But there are known gaps — and we're transparent about them:
        </p>
        <ul className="mt-2 space-y-2 text-[#a0a0b8]">
          <li>
            <strong className="text-[#e0e0ec]">No semantic adversary</strong> — FlashSpore grows,
            Scout checks structure, Verifier checks implementability. Nobody challenges <em>ideas</em>.
            You can specify real-time sync under a batch processing parent and nothing catches
            the logical contradiction. The{' '}
            <Link to="/agents" className="text-blue-400 hover:text-blue-300 underline">Skeptic agent</Link>{' '}
            is the most important missing piece.
          </li>
          <li>
            <strong className="text-[#e0e0ec]">No signal evaporation</strong> — Signals persist
            forever. Old conflict markers accumulate as noise. The signal-to-noise ratio degrades
            over very long runs.
          </li>
          <li>
            <strong className="text-[#e0e0ec]">Fixed maintenance scheduling</strong> — The
            maintenance cycle runs every 10 pulses regardless of tree state. Condition-triggered
            scheduling would be more efficient.
          </li>
          <li>
            <strong className="text-[#e0e0ec]">Phase coupling</strong> — The whole colony moves
            through phases together. Different branches should be able to evolve independently.
          </li>
        </ul>
        <p className="mt-3 text-[#a0a0b8]">
          These are known issues with clear solutions, not fundamental limitations. The
          architecture supports all of them — it's a matter of building the next layer.
        </p>
      </Section>

      <Section title="Glossary">
        <p className="mb-3">
          Quick reference for the biological terminology used throughout the project.
          These aren't just metaphors — each term maps to a real mechanism.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <GlossaryTerm term="Pheromone" link="/tree-guide">
            Signal values on nodes (need, confidence, conflict). Named after the chemical markers ants use to coordinate.
          </GlossaryTerm>
          <GlossaryTerm term="Foraging" link="/concepts">
            Exploration phase — agents decomposing broad concepts into specifics, like ants searching for food sources.
          </GlossaryTerm>
          <GlossaryTerm term="Brood Care" link="/concepts">
            Nurturing phase — agents reviewing and deepening existing content, like worker ants tending larvae.
          </GlossaryTerm>
          <GlossaryTerm term="Crystallization" link="/concepts">
            Final convergence — specifications solidifying into implementable form, like minerals forming crystal structure.
          </GlossaryTerm>
          <GlossaryTerm term="Necrophoresis" link="/agents">
            Dead node removal by the Grazer. From ant behavior of carrying dead colony members out of the nest.
          </GlossaryTerm>
          <GlossaryTerm term="FlashSpore" link="/agents">
            Primary decomposition agent. Named after fungal spore dispersal — colonizing new territory.
          </GlossaryTerm>
          <GlossaryTerm term="Germination" link="/concepts">
            Initial phase — rapid decomposition of the goal, like spores landing on fresh substrate.
          </GlossaryTerm>
          <GlossaryTerm term="Scent Trail" link="/agents">
            The branch map that FlashSpore uses for cross-branch overlap detection. Environmental markers, not direct communication.
          </GlossaryTerm>
          <GlossaryTerm term="Pulse" link="/tree-guide">
            One cycle: scan tree → select target → run agent → apply mutations. The heartbeat of the colony.
          </GlossaryTerm>
          <GlossaryTerm term="Scaffold" link="/tree-guide">
            Structural nodes seeded at init (user-flows, architecture, etc.). Like the initial framework of a termite mound.
          </GlossaryTerm>
          <GlossaryTerm term="Colony Phase" link="/concepts">
            Emergent lifecycle stage based on average confidence. Guides agent behavior without explicit coordination.
          </GlossaryTerm>
          <GlossaryTerm term="Evaporation" link="/concepts">
            (Future) Signal decay over time — unused pheromone trails fading, forcing re-evaluation of stale decisions.
          </GlossaryTerm>
        </div>
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

function BioExample({ name, emoji, children }: { name: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-semibold text-[#f0f0f8]">{name}</span>
      </div>
      <div className="text-xs text-[#a0a0b8] leading-relaxed">{children}</div>
    </div>
  );
}

function Signal({ name, color, value, children }: { name: string; color: string; value: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-sm font-semibold ${color}`}>{name}</span>
        <span className="text-[10px] text-[#707088]">{value}</span>
      </div>
      <div className="text-xs text-[#a0a0b8] leading-relaxed">{children}</div>
    </div>
  );
}

function PhaseCard({ phase, color, threshold, children }: { phase: string; color: string; threshold: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-3">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {phase}
        </span>
      </div>
      <div className="text-[10px] text-[#707088] mb-1.5">{threshold}</div>
      <div className="text-xs text-[#a0a0b8] leading-relaxed">{children}</div>
    </div>
  );
}

function MoatPoint({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-lg font-bold text-blue-400/40 shrink-0 w-6 text-right">{number}</span>
      <div>
        <div className="text-sm font-semibold text-[#f0f0f8] mb-1">{title}</div>
        <div className="text-xs text-[#a0a0b8] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function GlossaryTerm({ term, link, children }: { term: string; link: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e1e32] border border-[#3a3a55] rounded p-2.5">
      <Link to={link} className="text-xs font-semibold text-blue-400 hover:text-blue-300">
        {term}
      </Link>
      <div className="text-[11px] text-[#9090a8] leading-relaxed mt-0.5">{children}</div>
    </div>
  );
}
