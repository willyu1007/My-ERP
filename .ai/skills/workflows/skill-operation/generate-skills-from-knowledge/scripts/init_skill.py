#!/usr/bin/env python3
"""
init_skill.py - Initialize a new skill directory with compliant skeleton files.

Usage:
    python3 init_skill.py <skill-name> --path <target-directory>

Example:
    python3 init_skill.py my-new-skill --path .ai/skills/workflows/common

This script creates a skill directory with:
- SKILL.md (with valid YAML frontmatter, required sections)
- scripts/ directory placeholder
- reference.md placeholder

The generated skeleton passes `lint-skills.mjs --strict`.
"""

import argparse
import os
import sys
from pathlib import Path

SKILL_MD_TEMPLATE = """---
name: {skill_name}
description: [One sentence describing what the skill does and when to use the skill.]
---

# {skill_title}

## Purpose

[1-2 sentences: what problem does the skill solve?]

## When to use

Use the skill when:
- [Primary trigger condition]
- [Secondary trigger condition]

Do not use the skill when:
- [Negative trigger - when to skip]

## Inputs

- **[input_name]**: [description of required input]

## Outputs

- [Description of expected artifacts, file changes, or reports]

## Steps

### Scenario A: [Primary use case]

1. [First step - imperative verb]
2. [Second step]
3. [Third step]

### Scenario B: [Alternative use case] (optional)

1. [First step]
2. [Second step]

## Verification

- [ ] [Concrete verification command or check]
- [ ] [Expected outcome or pass criteria]

## Boundaries

- MUST NOT [critical constraint]
- SHOULD NOT [recommended constraint]
- [Additional safety or scope constraints]

## Included assets

- `./scripts/` - [placeholder for executable helpers]
- `./reference.md` - [placeholder for deep details]
"""

REFERENCE_MD_TEMPLATE = """# Reference: {skill_title}

## Overview

[Extended explanation of the skill's purpose and rationale.]

## Key decisions

[Document design choices and tradeoffs here.]

## Edge cases

[Document edge cases and alternative approaches.]

## Extended checklists

[Optional: detailed verification checklists.]
"""


def create_skill_directory(skill_name: str, target_path: str) -> None:
    """Create a new skill directory with skeleton files."""

    # Validate skill name (must be kebab-case)
    if not skill_name.replace("-", "").isalnum():
        print(f"Error: Skill name must be kebab-case alphanumeric: {skill_name}")
        sys.exit(1)

    if skill_name != skill_name.lower():
        print(f"Error: Skill name must be lowercase: {skill_name}")
        sys.exit(1)

    # Resolve target path
    target_dir = Path(target_path).resolve()
    skill_dir = target_dir / skill_name

    if skill_dir.exists():
        print(f"Error: Directory already exists: {skill_dir}")
        sys.exit(1)

    # Create directory structure
    skill_dir.mkdir(parents=True, exist_ok=False)
    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir()

    # Generate human-readable title
    skill_title = skill_name.replace("-", " ").title()

    # Write SKILL.md
    skill_md_path = skill_dir / "SKILL.md"
    skill_md_content = SKILL_MD_TEMPLATE.format(
        skill_name=skill_name, skill_title=skill_title
    )
    skill_md_path.write_text(skill_md_content)

    # Write reference.md
    reference_md_path = skill_dir / "reference.md"
    reference_md_content = REFERENCE_MD_TEMPLATE.format(skill_title=skill_title)
    reference_md_path.write_text(reference_md_content)

    # Write .gitkeep in scripts
    gitkeep_path = scripts_dir / ".gitkeep"
    gitkeep_path.write_text("")

    print(f"Created skill directory: {skill_dir}")
    print(f"  - SKILL.md")
    print(f"  - reference.md")
    print(f"  - scripts/")
    print("")
    print("Next steps:")
    print(f"  1. Edit {skill_md_path} to fill in placeholders")
    print(f"  2. Run: node .ai/scripts/lint-skills.mjs --strict")


def main():
    parser = argparse.ArgumentParser(
        description="Initialize a new skill directory with skeleton files."
    )
    parser.add_argument(
        "skill_name", help="Name of the skill (kebab-case, e.g., my-new-skill)"
    )
    parser.add_argument(
        "--path",
        required=True,
        help="Target directory where the skill folder will be created",
    )

    args = parser.parse_args()
    create_skill_directory(args.skill_name, args.path)


if __name__ == "__main__":
    main()
