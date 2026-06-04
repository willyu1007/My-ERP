# {{agent_name}} — Data flow and compliance

## Data classification
- classes: {{data_classes}}

## LLM egress
{{llm_egress_notes}}

## Conversation / state
- mode: {{conversation_mode}}
- scope: {{conversation_scope}}
- storage: {{conversation_storage_kind}}
- retention: ttl={{conversation_ttl_seconds}}s, max_items={{conversation_max_items}}
- redaction: {{conversation_redaction_mode}}

### Summary strategy (if applicable)
{{conversation_summary_notes}}

## Retention
{{retention_notes}}

