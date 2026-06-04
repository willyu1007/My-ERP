# {{agent_name}} — Integration

## Integration target
- kind: {{integration_target_kind}}
- name: {{integration_target_name}}
- details: {{integration_target_details}}

## Trigger
- kind: {{integration_trigger_kind}}

## HTTP interface
- base_path: `{{api_base_path}}`
- routes (fixed names):
  - `health`: `GET {{api_base_path}}{{api_health_path}}`
  - `run`: `POST {{api_base_path}}{{api_run_path}}`

### Streaming (WebSocket)
If enabled by the interface config:
- `WS {{api_base_path}}/ws`
- client sends `RunRequest` JSON
- server emits `RunEvent` messages + final completion

## Attachments

### Worker
{{worker_notes}}

### Cron
{{cron_notes}}

### Pipeline
{{pipeline_notes}}

### SDK
{{sdk_notes}}

## Failure contract (no suppression)
- mode: {{failure_mode}}
- rollback/disable: {{rollback_method}}
- kill switch: `AGENT_ENABLED` (required)

