# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

{{#DOMAIN}}
**Domain:** {{DOMAIN}}
{{/DOMAIN}}

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | {{LANGUAGE}} |
| Package Manager | {{PACKAGE_MANAGER}} |
| Layout | {{REPO_LAYOUT}} |
{{#FRONTEND_FRAMEWORK}}| Frontend | {{FRONTEND_FRAMEWORK}} |
{{/FRONTEND_FRAMEWORK}}
{{#BACKEND_FRAMEWORK}}| Backend | {{BACKEND_FRAMEWORK}} |
{{/BACKEND_FRAMEWORK}}
{{#DATABASE_KIND}}| Database | {{DATABASE_KIND}} |
{{/DATABASE_KIND}}
{{#API_STYLE}}| API | {{API_STYLE}} |
{{/API_STYLE}}

## Getting Started

### Prerequisites

{{#IS_NODE}}
- Node.js (LTS recommended)
- {{PACKAGE_MANAGER}}
{{/IS_NODE}}
{{#IS_PYTHON}}
- Python 3.8+
- {{PACKAGE_MANAGER}}
{{/IS_PYTHON}}
{{#IS_GO}}
- Go 1.21+
{{/IS_GO}}

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd {{PROJECT_NAME}}

# Install dependencies
{{INSTALL_COMMAND}}
```

### Development

```bash
{{DEV_COMMAND}}
```

## Project Structure

```
{{PROJECT_STRUCTURE}}
```

## Skills & AI Assistance

This project uses the AI-Friendly Repository pattern:

- **SSOT Skills**: `.ai/skills/` - Edit skills here only
- **Generated Wrappers**: `.codex/skills/`, `.claude/skills/` - Do NOT edit directly

Regenerate wrappers after skill changes:

```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `{{TEST_COMMAND}}`
4. Submit a pull request

## License

[Add your license here]
