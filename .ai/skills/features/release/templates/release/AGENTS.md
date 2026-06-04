# Release Management - AI Guidance

## Conclusions (read first)

- Use `ctl-release.mjs` for all release operations.
- AI proposes releases; humans approve and execute.
- Follow the configured versioning strategy.

## Workflow

1. **Prepare** release: `node .ai/skills/features/release/scripts/ctl-release.mjs prepare --version <version>`
2. **Generate** changelog: `node .ai/skills/features/release/scripts/ctl-release.mjs changelog`
3. **Request human** approval
4. **Tag** release: `node .ai/skills/features/release/scripts/ctl-release.mjs tag --version <version>`

## Version Strategies

| Strategy | Format | Example |
|----------|--------|---------|
| semantic | major.minor.patch | 1.2.3 |
| calendar | YYYY.MM.DD | 2024.01.15 |
| manual | custom | any |

## Semantic Versioning Guidelines

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes (backward compatible)

## Commands Reference

```bash
# Check status
node .ai/skills/features/release/scripts/ctl-release.mjs status

# Prepare release
node .ai/skills/features/release/scripts/ctl-release.mjs prepare --version 1.2.0

# Generate changelog
node .ai/skills/features/release/scripts/ctl-release.mjs changelog

# Create tag
node .ai/skills/features/release/scripts/ctl-release.mjs tag --version 1.2.0
```

## Forbidden Actions

- Direct version bumps without changelog
- Skipping release approval
- Tagging without verification
- Manual git tag creation (use ctl-release)
