# Tool Implementation Patterns

This document provides implementation patterns for different tool types defined in the blueprint.

---

## 1. From Blueprint to Implementation

The blueprint defines tools in `tools.tools[]`. Each tool has:

```json
{
  "id": "search_documents",
  "kind": "http_api",
  "side_effect_level": "read_only",
  "input_schema_ref": "#/schemas/SearchInput",
  "output_schema_ref": "#/schemas/SearchOutput",
  "error_schema_ref": "#/schemas/ToolError",
  "timeouts": { "timeout_ms": 5000 },
  "retry": { "max_attempts": 3, "backoff": "exponential_jitter" },
  "idempotency": { "strategy": "none" },
  "auth": { "kind": "api_key", "env_var": "SEARCH_API_KEY" },
  "audit": { "required": true, "log_fields": ["tool_id", "request_id", "duration_ms"] }
}
```

**Implementation Steps**:

1. Read the tool spec from blueprint
2. Locate the schema definitions for input/output/error
3. Implement the function following the pattern for `kind`
4. Add retry logic if `retry.max_attempts > 1`
5. Add audit logging if `audit.required`
6. Register in `tools.mjs` exports

---

## 2. Implementation Patterns by Kind

### 2.1 HTTP API Tool

```javascript
// src/core/tools.mjs

const { agentError } = require('./errors');

async function search_documents(input, { manifest, contract_version, logger }) {
  const startTime = Date.now();
  const spec = manifest.tools.tools.find(t => t.id === 'search_documents');
  const baseUrl = process.env.SEARCH_API_BASE_URL;
  const apiKey = process.env[spec.auth.env_var];

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'tool_config_error',
        message: 'Search API not configured',
        retryable: false
      })
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), spec.timeouts.timeout_ms);

  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      return {
        ok: false,
        error: agentError({
          contract_version,
          code: 'tool_http_error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          retryable,
          details: { status: response.status }
        })
      };
    }

    const data = await response.json();
    
    // Audit log
    if (spec.audit?.required && logger) {
      logger.info({
        event: 'tool_executed',
        tool_id: 'search_documents',
        duration_ms: Date.now() - startTime,
        success: true
      });
    }

    return { ok: true, output: data };

  } catch (err) {
    clearTimeout(timeout);
    
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: isTimeout ? 'tool_timeout' : 'tool_exception',
        message: err.message,
        retryable: isTimeout
      })
    };
  }
}
```

### 2.2 Database Query Tool

```javascript
async function query_database(input, { manifest, contract_version, db }) {
  const spec = manifest.tools.tools.find(t => t.id === 'query_database');

  // Validate input against schema (simplified)
  if (!input.query || typeof input.query !== 'string') {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'invalid_input',
        message: 'Query string required',
        retryable: false
      })
    };
  }

  // Sanitize to prevent injection (example - use proper ORM/prepared statements)
  const sanitized = input.query.replace(/[;'"\\]/g, '');

  try {
    const result = await db.query(sanitized, {
      timeout: spec.timeouts.timeout_ms
    });

    return {
      ok: true,
      output: {
        rows: result.rows,
        rowCount: result.rowCount
      }
    };

  } catch (err) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'database_error',
        message: err.message,
        retryable: err.code === 'ECONNRESET'
      })
    };
  }
}
```

### 2.3 MCP Server Tool

```javascript
async function mcp_tool(input, { manifest, contract_version, mcpClient }) {
  const spec = manifest.tools.tools.find(t => t.id === 'mcp_tool');

  if (!mcpClient) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'mcp_not_configured',
        message: 'MCP client not available',
        retryable: false
      })
    };
  }

  try {
    const result = await mcpClient.callTool({
      name: spec.id,
      arguments: input
    }, {
      timeout: spec.timeouts.timeout_ms
    });

    if (result.isError) {
      return {
        ok: false,
        error: agentError({
          contract_version,
          code: 'mcp_tool_error',
          message: result.content?.[0]?.text || 'MCP tool failed',
          retryable: false
        })
      };
    }

    return {
      ok: true,
      output: result.content
    };

  } catch (err) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'mcp_exception',
        message: err.message,
        retryable: true
      })
    };
  }
}
```

---

## 3. Retry Logic Pattern

```javascript
async function executeWithRetry(fn, spec) {
  const maxAttempts = spec.retry?.max_attempts || 1;
  const backoff = spec.retry?.backoff || 'fixed';

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn();
    
    if (result.ok) return result;
    if (!result.error?.retryable) return result;
    
    lastError = result.error;
    
    if (attempt < maxAttempts) {
      const delay = calculateDelay(attempt, backoff);
      await sleep(delay);
    }
  }

  return { ok: false, error: lastError };
}

function calculateDelay(attempt, backoff) {
  const base = 1000; // 1 second
  switch (backoff) {
    case 'fixed':
      return base;
    case 'exponential':
      return base * Math.pow(2, attempt - 1);
    case 'exponential_jitter':
      return base * Math.pow(2, attempt - 1) * (0.5 + Math.random());
    default:
      return base;
  }
}
```

---

## 4. Registering Tools

Update `src/core/tools.mjs` to export all implementations:

```javascript
const toolImplementations = {
  search_documents,
  query_database,
  mcp_tool,
  // Add more tools here
};

async function executeTool({ manifest, toolId, input, contract_version, context }) {
  const toolSpec = manifest.tools?.tools?.find(t => t.id === toolId);
  
  if (!toolSpec) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'tool_not_found',
        message: `Unknown tool: ${toolId}`,
        retryable: false
      })
    };
  }

  // Check side effect policy
  const approvalErr = requireApprovalIfNeeded({ manifest, toolSpec, contract_version });
  if (approvalErr) return { ok: false, error: approvalErr };

  // Get implementation
  const impl = toolImplementations[toolId];
  if (!impl) {
    return {
      ok: false,
      error: agentError({
        contract_version,
        code: 'tool_not_implemented',
        message: `Tool ${toolId} has no implementation`,
        retryable: false
      })
    };
  }

  // Execute with retry if configured
  if (toolSpec.retry?.max_attempts > 1) {
    return executeWithRetry(
      () => impl(input, { manifest, contract_version, ...context }),
      toolSpec
    );
  }

  return impl(input, { manifest, contract_version, ...context });
}

module.exports = {
  getToolDefinitionsForLLM,
  executeTool
};
```

---

## 5. Tool Checklist

- [ ] Each tool in `blueprint.tools.tools[]` has implementation
- [ ] Tool implementations handle timeout correctly
- [ ] Tool implementations return proper error structure
- [ ] Retry logic implemented for tools with `max_attempts > 1`
- [ ] Audit logging added for tools with `audit.required`
- [ ] Side effect policy enforced

