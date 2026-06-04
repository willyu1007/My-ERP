# Examples — Tier 2

## 1. Simple Query (No Tools)

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "input": "Explain the difference between HTTP and HTTPS"
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-001",
  "status": "ok",
  "output": "HTTP (Hypertext Transfer Protocol) transmits data in plain text, making it vulnerable to interception. HTTPS (HTTP Secure) adds TLS/SSL encryption, ensuring data is encrypted during transmission. HTTPS is required for sensitive data like passwords and payment information.",
  "metadata": {
    "generated_at": "2025-01-01T00:00:00Z"
  }
}
```

## 2. Query with Tool Usage

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "input": "Search for recent articles about AI safety"
}
```

**Assistant Reasoning**:
- Task requires external data → Use `search_documents` tool
- Tool is read-only → Safe to execute

**Tool Call**:
```json
{
  "name": "search_documents",
  "arguments": { "query": "AI safety recent articles" }
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-002",
  "status": "ok",
  "output": "I found 3 recent articles on AI safety:\n\n1. \"Responsible AI Development\" (Jan 2025) - Discusses governance frameworks\n2. \"AI Alignment Challenges\" (Dec 2024) - Technical approaches to alignment\n3. \"Safety by Design\" (Nov 2024) - Industry best practices\n\nWould you like me to summarize any of these?",
  "structured_output": {
    "articles": [
      { "title": "Responsible AI Development", "date": "2025-01" },
      { "title": "AI Alignment Challenges", "date": "2024-12" },
      { "title": "Safety by Design", "date": "2024-11" }
    ]
  },
  "metadata": {
    "tools_used": ["search_documents"]
  }
}
```

## 3. Write Operation Requiring Approval

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-003",
  "input": "Update the user's email to new@example.com"
}
```

**Output** (when `writes_require_approval`):
```json
{
  "contract_version": "1.0.0",
  "code": "approval_required",
  "message": "This operation requires approval. The requested change: update email to new@example.com",
  "retryable": false,
  "details": {
    "operation": "update_user",
    "side_effect_level": "write",
    "pending_changes": {
      "field": "email",
      "new_value": "new@example.com"
    }
  }
}
```

## 4. Out of Scope Request (Graceful Decline)

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-004",
  "input": "Execute this SQL: DROP TABLE users;"
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-004",
  "status": "ok",
  "output": "I cannot execute arbitrary SQL commands, especially destructive ones like DROP TABLE. This is outside my permitted operations.\n\nI can help you with:\n- Searching existing data\n- Generating reports\n- Answering questions about data structure\n\nWould any of these be helpful?",
  "metadata": {
    "declined_reason": "out_of_scope"
  }
}
```

## 5. Tool Failure Handling

**Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-005",
  "input": "Get the current weather in Tokyo"
}
```

**Tool Call** (fails with timeout):
```json
{
  "name": "weather_api",
  "arguments": { "city": "Tokyo" }
}
```

**Output**:
```json
{
  "contract_version": "1.0.0",
  "code": "tool_timeout",
  "message": "The weather service is temporarily unavailable. Please try again in a few moments.",
  "retryable": true,
  "details": {
    "tool": "weather_api",
    "error": "timeout"
  }
}
```

## 6. Conversation with Context

**Turn 1 Input**:
```json
{
  "contract_version": "1.0.0",
  "request_id": "req-006",
  "conversation_id": "conv-001",
  "input": "I'm planning a trip to Japan next month"
}
```

**Turn 1 Output**:
```json
{
  "status": "ok",
  "output": "That sounds exciting! Japan in [month] offers [seasonal highlights]. What aspects of your trip would you like help with? I can assist with:\n- Travel itinerary suggestions\n- Cultural tips\n- Practical information"
}
```

**Turn 2 Input** (same conversation):
```json
{
  "request_id": "req-007",
  "conversation_id": "conv-001",
  "input": "What's the best way to get from Tokyo to Kyoto?"
}
```

**Turn 2 Output** (using conversation context):
```json
{
  "status": "ok",
  "output": "For your Japan trip, the best way from Tokyo to Kyoto is the Shinkansen (bullet train):\n\n- **Duration**: ~2 hours 15 minutes\n- **Cost**: ¥13,320 one-way\n- **Frequency**: Every 10-20 minutes\n\nConsider a JR Pass if you'll travel more than Tokyo-Kyoto-Osaka round trip."
}
```
