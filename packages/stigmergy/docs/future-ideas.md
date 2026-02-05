# Future Ideas

## Analytics Output Format

An output format for data analysts to see generation-by-generation what happened, enabling better tuning of the ratios between when various entities are called.

**Use case:** Understanding how the tree evolved pulse-by-pulse, which agents fired when, what mutations succeeded/failed, and how signals changed over time.

**Possible format:** JSONL with one record per pulse containing:
- Pulse number, timestamp
- Target node and its signals before/after
- Agent that ran, mutations attempted/succeeded
- Maintenance events (scout fixes, grazer prunes, resolver attempts)
- Tree stats snapshot

## Subtree Merges with Ecology Repair

Implementing subtree merges where our ecology literally repairs any merge we make. When two subtrees are merged:
- The Synthesizer unifies content
- The Weaver detects what was orphaned
- The Scout flags inconsistencies
- The Resolver addresses conflicts

The ecology should heal structural changes, not just detect problems.

## Subtree Relocation

Something that takes things out of subtree at point A and puts them into point B if B is better overall.

**Trigger:** Weaver detects a node that semantically belongs in a different branch.

**Action:** A new "Relocator" agent or enhanced Weaver could:
1. Identify the better parent location
2. Move the subtree (preserving children)
3. Update any cross-references
4. Let the ecology repair any inconsistencies

This enables the tree to self-organize beyond just merging duplicates.

## Large Tree Optimizations

The 588-node run exposed Weaver struggling with context size. Possible mitigations:
- Chunk the tree into branches for separate Weaver calls
- Only compare nodes above a confidence threshold
- Incremental comparison (only check nodes changed since last weave)
- Hierarchical summarization for very large trees
