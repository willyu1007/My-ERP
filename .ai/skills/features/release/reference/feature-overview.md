# Release Feature

## Purpose

This feature provides **version and changelog management** infrastructure for consistent release processes.

## Versioning Strategies

| Strategy | Format | When to Use |
|----------|--------|-------------|
| `semantic` | major.minor.patch | Libraries, APIs with compatibility concerns |
| `calendar` | YYYY.MM.DD | Regular release schedules |
| `manual` | custom | Special requirements |

## Key Components

### Release Configuration

`release/config.json` stores:
- Current version
- Versioning strategy
- Branch configuration

### Changelog

`release/changelog-template.md` provides the changelog format following [Keep a Changelog](https://keepachangelog.com/).

### semantic-release Integration

`release/.releaserc.json.template` provides configuration for automated releases using [semantic-release](https://semantic-release.gitbook.io/).

## AI/LLM Usage

When working with releases, AI should:

1. **Check** status: `ctl-release status`
2. **Prepare** release: `ctl-release prepare --version x.y.z`
3. **Generate** changelog: `ctl-release changelog`
4. **Document** in `handbook/`
5. **Request human** to approve and tag

Never directly create git tags or modify version files.

## Quick Reference

```bash
# Initialize
node .ai/skills/features/release/scripts/ctl-release.mjs init --strategy semantic

# Check status
node .ai/skills/features/release/scripts/ctl-release.mjs status

# Prepare release
node .ai/skills/features/release/scripts/ctl-release.mjs prepare --version 1.2.0

# Generate changelog
node .ai/skills/features/release/scripts/ctl-release.mjs changelog

# Create tag (requires human approval)
node .ai/skills/features/release/scripts/ctl-release.mjs tag --version 1.2.0
```
