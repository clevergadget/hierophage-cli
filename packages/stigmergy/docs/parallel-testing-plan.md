# Parallel Pulse Testing Plan

Testing the various complex ways async execution can interact around the tree.

## Race Condition Scenarios

### 1. Same-Parent Child Creation
- [ ] Two agents target same parent, both decide to DECOMPOSE
- [ ] Expected: First CREATE_NODE succeeds, second gets duplicate path error
- [ ] Verify: Tree remains valid, no orphaned nodes

### 2. Sibling Selection Conflict
- [ ] `selectNHighestPriority` avoids siblings but what if tree changes mid-batch?
- [ ] Test: Start batch, mutate tree during agent execution, verify no crashes
- [ ] Edge case: Sibling created by agent A, agent B selected before creation

### 3. Signal Update Races
- [ ] Both agents update same node's signals concurrently
- [ ] Test: Force two agents to target same path (bypass sibling avoidance)
- [ ] Verify: Last write wins, no corruption

### 4. Parent-Child Signal Propagation
- [ ] Agent A settles a child while agent B reviews the parent
- [ ] Test: Parent propagation runs during active pulse
- [ ] Verify: Propagation sees consistent state

### 5. Maintenance Cycle Interference
- [ ] Scout/Grazer/Verifier run while pulses are in flight
- [ ] Currently: Maintenance runs between batches (safe)
- [ ] Test: What if maintenance was async? (future concern)

## Stale Context Scenarios

### 6. Context Chain Staleness
- [ ] Agent reads context, tree mutates, agent writes based on stale context
- [ ] Example: Parent content updated by agent A, agent B decomposes based on old content
- [ ] Test: Measure staleness rate in real runs, determine if problematic

### 7. Children List Staleness
- [ ] Agent reads `listChildren`, sibling adds children, agent's REVIEW misses them
- [ ] Test: Force scenario, verify agent handles gracefully

### 8. Priority Queue Drift
- [ ] Batch selects 4 targets, mutations change priorities mid-batch
- [ ] Test: Verify no duplicate work on same node in single batch

## Budget/Tracking Scenarios

### 9. Parallel Budget Accounting
- [ ] Multiple agents make API calls, budget tracker sees them concurrently
- [ ] Test: Verify total cost matches sum of individual costs
- [ ] Test: Budget exceeded detection works mid-batch

### 10. Temperature Tracking
- [ ] Multiple agents mutate different nodes, temperature updated correctly
- [ ] Test: Overheating detection works with parallel mutations

## Recovery Scenarios

### 11. Partial Batch Failure
- [ ] 2 of 4 agents fail (API error), other 2 succeed
- [ ] Test: Verify partial results saved, simulation continues

### 12. All Agents Same Error
- [ ] All 4 agents hit 503, batch returns empty/errors
- [ ] Test: Verify graceful handling, no infinite retry loop

## Test Implementation Notes

```typescript
// Force race condition test
it('handles concurrent decomposition of same parent', async () => {
  // Create workspace with single high-priority node
  // Bypass selectNHighestPriority, force both agents to target same node
  // Run batchPulse
  // Verify: one CREATE_NODE succeeds, tree valid
});

// Stale context test
it('tolerates stale context reads', async () => {
  // Create workspace
  // Start agent A on node X
  // While A running, mutate node X's parent
  // Let A complete
  // Verify: mutations applied (may be suboptimal but not corrupt)
});
```

## Priority

1. **High**: Tests 1, 3, 9, 11 (can cause data corruption or loss)
2. **Medium**: Tests 2, 4, 5, 10 (can cause suboptimal behavior)
3. **Low**: Tests 6, 7, 8, 12 (edge cases, self-correcting)
