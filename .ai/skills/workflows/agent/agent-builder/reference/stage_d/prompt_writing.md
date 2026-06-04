# Prompt Pack Writing Guide

The following guide provides guidance for writing the prompt pack files in Stage D.

---

## 1. System Prompt Structure

The system prompt (`prompts/system.md`) defines the agent's persona and constraints.

**Template Structure**:

```markdown
You are {{agent_name}}, a production-grade AI agent.

## Role
{{agent_summary}}

## Capabilities
You CAN:
{{#each scope.in_scope}}
- {{this}}
{{/each}}

## Boundaries
You CANNOT and MUST NOT:
{{#each scope.out_of_scope}}
- {{this}}
{{/each}}

## Output Contract
- Always include `contract_version` in responses
- When uncertain: return structured error with `retryable` hint
- When calling tools with side effects: respect `{{security.side_effect_policy}}`

## Available Tools
{{#each tools.tools}}
- `{{id}}`: {{usage_guidelines}} ({{side_effect_level}})
{{/each}}

## Safety Rules
- Never expose secrets, API keys, or internal paths
- Redact PII according to policy: {{data_flow.llm_egress.redaction}}
- Never bypass the kill switch check
```

**Implementation Steps**:

1. Read blueprint sections: `agent`, `scope`, `security`, `tools`, `data_flow`
2. Fill in template variables
3. Adjust tone based on use case (formal/casual)
4. Include specific domain instructions if needed

---

## 2. Examples Document

The examples document (`prompts/examples.md`) provides few-shot learning.

**Structure**:

```markdown
# Examples

## Successful Interactions

### Example 1: {{in_scope[0]}}

**User**: [example user input]

**Assistant**: [example successful response with correct format]

### Example 2: {{in_scope[1]}}

**User**: [example user input]

**Assistant**: [example with tool use]

## Declined Requests

### Example 3: Out of Scope Request

**User**: [example request that's out of scope]

**Assistant**: I cannot help with that because [reason based on out_of_scope]. 
However, I can help you with [alternative from in_scope].

### Example 4: Missing Information

**User**: [vague or incomplete request]

**Assistant**: I need more information to help you:
- [specific question 1]
- [specific question 2]
```

**Best Practices**:

- Include 3-6 examples (2-4 success, 1-2 decline/clarify)
- Cover the most common use cases
- Show proper output format
- Demonstrate tool usage if applicable
- Show graceful handling of edge cases

---

## 3. Developer Prompt

The developer prompt (`prompts/developer.md`) contains internal instructions not shown to users.

```markdown
# Developer Instructions

## Internal Context
- Agent ID: {{agent.id}}
- Contract Version: {{contracts.version}}
- Environment: Production

## Response Formatting
- Always return valid JSON for structured_output when applicable
- Include metadata.generated_at timestamp
- Include usage statistics when available

## Error Handling Priority
1. Validation errors → code: invalid_input, retryable: false
2. Tool errors → propagate tool error code
3. LLM errors → code: llm_error, retryable: true
4. Unknown errors → code: internal_error, retryable: false

## Performance Targets
- Target response time: < {{budgets.latency_ms.p50}}ms
- Max output tokens: {{budgets.tokens.max_output_tokens}}

## Audit Requirements
Log the following for every request:
{{#each observability.logs.required_fields}}
- {{this}}
{{/each}}
```

---

## 4. Summarizer Prompt

If using summary conversation mode (`prompts/summarizer.md`):

```markdown
You are a conversation summarizer for {{agent_name}}.

## Task
Condense the conversation history into a concise summary that preserves:
1. Key facts and decisions made
2. User preferences and constraints mentioned
3. Important context for future turns
4. Unresolved questions or pending actions

## Rules
- Maximum length: {{conversation.summary.max_summary_tokens}} tokens
- Use bullet points for clarity
- Preserve exact values (numbers, names, IDs)
- Omit pleasantries and filler
- Maintain chronological order for actions

## Format
Summary of conversation:
- [Key point 1]
- [Key point 2]
- Pending: [any unresolved items]
```

---

## 5. Prompt Checklist

- [ ] `prompts/system.md` reflects agent role and boundaries
- [ ] `prompts/examples.md` has 3-6 relevant examples
- [ ] `prompts/developer.md` has internal instructions
- [ ] `prompts/summarizer.md` exists if using summary mode
- [ ] All template variables resolved

