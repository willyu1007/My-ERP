# Test Writing Guide

This document provides guidance for writing tests in Stage D based on acceptance scenarios.

---

## 1. Converting Acceptance Scenarios to Tests

Each scenario in `acceptance.scenarios[]` becomes a test case.

**Blueprint Scenario**:
```json
{
  "title": "HTTP run returns a structured response",
  "given": "AGENT_ENABLED=true and LLM credentials are configured",
  "when": "POST /agents/example-agent/run with a valid RunRequest",
  "then": "API returns RunResponse with status=ok",
  "expected_output_checks": [
    "status == ok",
    "output is non-empty",
    "contract_version preserved"
  ],
  "priority": "P0"
}
```

**Example Test** (using Node.js built-in test runner):

```javascript
// tests/smoke.test.mjs

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runAgent } from '../src/core/run.mjs';

describe('Acceptance Scenarios', () => {

  describe('P0: HTTP run returns a structured response', () => {
    // Given: AGENT_ENABLED=true and LLM credentials are configured
    before(() => {
      process.env.AGENT_ENABLED = 'true';
      process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://mock-llm';
      process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test-key';
    });

    test('should return RunResponse with status=ok', async () => {
      // When: POST /agents/example-agent/run with a valid RunRequest
      const request = {
        contract_version: '1.0.0',
        request_id: 'test-req-001',
        input: 'Hello, test input'
      };

      const result = await runAgent(request, { responseMode: 'blocking' });

      // Then: API returns RunResponse with status=ok
      assert.strictEqual(result.ok, true, 'Result should be ok');
      
      const response = result.response;

      // Check: status == ok
      assert.strictEqual(response.status, 'ok', 'status should be ok');

      // Check: output is non-empty
      assert.ok(response.output && response.output.length > 0, 'output should be non-empty');

      // Check: contract_version preserved
      assert.strictEqual(response.contract_version, request.contract_version, 
        'contract_version should be preserved');
    });
  });

  describe('P0: Kill switch returns unavailable', () => {
    // Given: AGENT_ENABLED=false
    before(() => {
      process.env.AGENT_ENABLED = 'false';
    });

    after(() => {
      process.env.AGENT_ENABLED = 'true';
    });

    test('should return AgentError with retryable=false', async () => {
      // When: POST /agents/example-agent/run
      const request = {
        contract_version: '1.0.0',
        request_id: 'test-req-002',
        input: 'Test input'
      };

      const result = await runAgent(request, { responseMode: 'blocking' });

      // Then: API returns AgentError with retryable=false
      assert.strictEqual(result.ok, false, 'Result should not be ok');

      const error = result.error;

      // Check: retryable == false
      assert.strictEqual(error.retryable, false, 'retryable should be false');

      // Check: appropriate error code
      assert.strictEqual(error.code, 'agent_disabled', 'code should be agent_disabled');
    });
  });

});
```

> **Note:** Uses `node:test` built-in module (Node.js 18+). Run with `node --test tests/`.

---

## 2. Test Organization

```
tests/
├── smoke.test.mjs         # Minimal scaffold; extend it for acceptance coverage
├── unit/
│   ├── tools.test.mjs     # Tool unit tests
│   ├── prompts.test.mjs   # Prompt loading tests
│   └── conversation.test.mjs  # Memory tests
├── integration/
│   ├── http.test.mjs      # HTTP adapter tests
│   └── worker.test.mjs    # Worker adapter tests
└── fixtures/
    ├── requests/         # Sample request JSONs
    └── responses/        # Expected response JSONs
```

---

## 3. Mock Strategies

### LLM Mock

```javascript
// tests/mocks/llm.mjs
export function createMockLLM(responses) {
  let callIndex = 0;
  return {
    complete: async ({ messages }) => {
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      return {
        choices: [{
          message: {
            content: response.content,
            tool_calls: response.tool_calls || []
          }
        }]
      };
    },
    stream: async ({ onDelta }) => {
      const text = responses[0]?.content || 'Mock response';
      for (const char of text) {
        onDelta({ ts: new Date().toISOString(), delta: char });
      }
      return { stream_text: text };
    }
  };
}
```

### Tool Mock

```javascript
// tests/mocks/tools.mjs
export function createMockTools(toolResponses) {
  return {
    executeTool: async ({ toolId, input }) => {
      if (toolResponses[toolId]) {
        return toolResponses[toolId](input);
      }
      return {
        ok: false,
        error: { code: 'tool_not_mocked', message: `No mock for ${toolId}` }
      };
    }
  };
}
```

---

## 4. Running Tests

```bash
# Run all tests
node --test tests/

# Run smoke test only (scaffold)
node --test tests/smoke.test.mjs

# Run with coverage (Node 20+)
node --test --experimental-test-coverage tests/
```

---

## 5. Test Checklist

- [ ] Each `acceptance.scenarios[]` has a corresponding test
- [ ] P0 scenarios pass
- [ ] Kill switch scenario tested
- [ ] Mocks in place for external dependencies
- [ ] Tests can run offline (no real API calls)
