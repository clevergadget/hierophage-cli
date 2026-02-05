# Future Ideas

Ideas for future development, not yet implemented.

## Analytics & Tuning

### Generation-by-Generation Output Format
A structured output format (JSON/CSV) that captures what happened at each pulse/generation:
- Which entity ran
- What mutations were attempted/succeeded
- Signal changes
- Cost incurred

Purpose: Enable data analysts to tune the ratios between entity invocation frequencies (Scout every N pulses, Weaver every M pulses, etc.)

## Tree Surgery

### Subtree Merges with Self-Healing
Implement cross-branch merges where the ecology can literally repair any structural damage from the merge. If merging subtree A into subtree B creates conflicts or orphans, the maintenance agents should detect and heal automatically.

### Subtree Relocation
An operation that moves a subtree from point A to point B if B is a better overall location for that concept. Detection could be:
- Weaver identifies that a subtree "belongs" more in another branch
- Parent-child semantic mismatch detection
- Cross-branch reference density (if X references Y's children more than X's own, maybe move)

## Other Ideas

(Add future ideas here as they emerge)
