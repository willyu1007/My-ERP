# Developer Instructions — Tier 3

## Internal Context

The agent operates in a high-reliability production environment with:
- Strict audit requirements
- Complex workflow orchestration
- Multi-tool dependencies
- Budget and resource constraints

## Advanced Response Formatting

### Execution Trace Format
```typescript
{
  execution_trace: Array<{
    step: string,           // Step identifier
    tool?: string,          // Tool used (if any)
    status: "started" | "completed" | "failed" | "skipped",
    duration_ms?: number,
    input_hash?: string,    // For idempotency tracking
    output_summary?: string,
    error?: {
      code: string,
      message: string,
      retryable: boolean
    }
  }>
}
```

### Plan Format
```typescript
{
  plan: {
    id: string,
    created_at: string,
    steps: Array<{
      id: string,
      action: string,
      tool?: string,
      depends_on?: string[],  // Step IDs
      condition?: string,     // e.g., "step_1.output.count > 0"
      estimated_duration_ms?: number,
      rollback_action?: string
    }>,
    checkpoints: Array<{
      after_step: string,
      save_state: boolean,
      validate?: string
    }>,
    budget: {
      max_duration_ms: number,
      max_tokens: number,
      max_cost_usd: number
    }
  }
}
```

## Tool Orchestration

### Dependency Resolution
```javascript
// Example: Resolve tool execution order
function resolveOrder(steps) {
  const resolved = [];
  const pending = [...steps];
  
  while (pending.length > 0) {
    const ready = pending.filter(s => 
      !s.depends_on || s.depends_on.every(d => resolved.includes(d))
    );
    
    if (ready.length === 0) throw new Error('Circular dependency');
    
    // Execute ready steps (can parallelize if no conflicts)
    resolved.push(...ready.map(s => s.id));
    pending = pending.filter(s => !ready.includes(s));
  }
  
  return resolved;
}
```

### Parallel Execution Rules
Tools can be executed in parallel when:
1. No data dependencies between them
2. No shared resource conflicts
3. Combined timeout within budget
4. Side effects are independent

### Conditional Execution
```
IF condition THEN step_a ELSE step_b

Conditions can reference:
- Previous step outputs: step_1.output.field
- Environment: env.FEATURE_FLAG
- Request context: request.options.mode
```

## Error Handling Strategy

### Error Classification
```typescript
enum ErrorSeverity {
  TRANSIENT,  // Retry with backoff
  DATA,       // Bad input, don't retry
  RESOURCE,   // Budget/quota exceeded
  SYSTEM,     // Internal failure
  SECURITY    // Policy violation
}
```

### Retry Policy
```javascript
async function executeWithRetry(fn, config) {
  for (let attempt = 1; attempt <= config.max_attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt === config.max_attempts) {
        throw error;
      }
      await sleep(calculateBackoff(attempt, config.backoff));
    }
  }
}

function calculateBackoff(attempt, type) {
  const base = 1000;
  switch (type) {
    case 'fixed': return base;
    case 'exponential': return base * Math.pow(2, attempt - 1);
    case 'exponential_jitter': 
      return base * Math.pow(2, attempt - 1) * (0.5 + Math.random());
  }
}
```

### Partial Success Handling
```javascript
async function executeSteps(steps) {
  const results = [];
  const failures = [];
  
  for (const step of steps) {
    try {
      const result = await execute(step);
      results.push({ step: step.id, status: 'success', result });
    } catch (error) {
      if (step.critical) {
        // Critical step failed - abort and rollback
        await rollback(results);
        throw error;
      }
      // Non-critical - record failure and continue
      failures.push({ step: step.id, error });
    }
  }
  
  return { 
    status: failures.length > 0 ? 'partial' : 'complete',
    results,
    failures
  };
}
```

## State Management

### Checkpoint Protocol
```javascript
async function executeWithCheckpoints(plan) {
  let state = initializeState();
  
  for (const step of plan.steps) {
    // Execute step
    const result = await executeStep(step, state);
    state = updateState(state, result);
    
    // Check for checkpoint
    const checkpoint = plan.checkpoints.find(c => c.after_step === step.id);
    if (checkpoint?.save_state) {
      await saveCheckpoint(plan.id, step.id, state);
    }
  }
  
  return state;
}
```

### Recovery from Checkpoint
```javascript
async function recoverExecution(planId, fromCheckpoint) {
  const savedState = await loadCheckpoint(planId, fromCheckpoint);
  const plan = await loadPlan(planId);
  
  // Find remaining steps
  const completedSteps = new Set(savedState.completedSteps);
  const remainingSteps = plan.steps.filter(s => !completedSteps.has(s.id));
  
  return executeWithCheckpoints({ ...plan, steps: remainingSteps }, savedState);
}
```

## Budget Enforcement

### Pre-Execution Check
```javascript
function validateBudget(plan, limits) {
  const estimates = estimateResources(plan);
  
  return {
    duration: {
      estimated: estimates.duration_ms,
      limit: limits.max_duration_ms,
      ok: estimates.duration_ms <= limits.max_duration_ms
    },
    tokens: {
      estimated: estimates.tokens,
      limit: limits.max_tokens,
      ok: estimates.tokens <= limits.max_tokens
    },
    cost: {
      estimated: estimates.cost_usd,
      limit: limits.max_cost_usd,
      ok: estimates.cost_usd <= limits.max_cost_usd
    }
  };
}
```

### Runtime Tracking
```javascript
class BudgetTracker {
  constructor(limits) {
    this.limits = limits;
    this.usage = { duration_ms: 0, tokens: 0, cost_usd: 0 };
  }
  
  record(metric, value) {
    this.usage[metric] += value;
    if (this.usage[metric] > this.limits[`max_${metric}`]) {
      throw new BudgetExceededError(metric, this.usage[metric], this.limits[`max_${metric}`]);
    }
  }
  
  remaining() {
    return {
      duration_ms: this.limits.max_duration_ms - this.usage.duration_ms,
      tokens: this.limits.max_tokens - this.usage.tokens,
      cost_usd: this.limits.max_cost_usd - this.usage.cost_usd
    };
  }
}
```

## Audit Trail

### Required Log Events
```javascript
const AuditEvents = {
  PLAN_CREATED: 'plan.created',
  STEP_STARTED: 'step.started',
  STEP_COMPLETED: 'step.completed',
  STEP_FAILED: 'step.failed',
  TOOL_CALLED: 'tool.called',
  TOOL_RESULT: 'tool.result',
  CHECKPOINT_SAVED: 'checkpoint.saved',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_GRANTED: 'approval.granted',
  BUDGET_WARNING: 'budget.warning',
  EXECUTION_COMPLETED: 'execution.completed'
};
```

### Log Format
```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "event": "tool.called",
  "request_id": "req-001",
  "correlation_id": "corr-abc",
  "plan_id": "plan-xyz",
  "step_id": "step-2",
  "tool_id": "query_database",
  "duration_ms": 234,
  "input_hash": "sha256:abc123...",
  "output_size_bytes": 1024,
  "success": true
}
```

## Security Considerations

1. **Input Sanitization**: Validate all inputs before tool execution
2. **Output Filtering**: Remove sensitive data before logging
3. **Approval Gates**: Enforce for destructive operations
4. **Rate Limiting**: Track and limit tool call frequency
5. **Audit Completeness**: Log all state-changing operations

## Performance Guidelines

- P50 latency target: < 5 seconds (simple workflows)
- P95 latency target: < 30 seconds (complex workflows)
- Maximum concurrent tool calls: 5
- Checkpoint interval: Every 3 steps or 10 seconds
