# Tako CLI

AI coding tools launcher — unified interface for managing and running AI development tools (Claude Code, Codex, Gemini, OpenCode).

## Quick Install

```bash
curl -fsSL https://cdn.jsdelivr.net/npm/tako-cli/install.sh | bash
```

Or via npm:

```bash
npm install -g tako-cli
```

## Setup

```bash
tako                          # First run: interactive setup
tako install claude-code      # Install Claude Code
tako install codex            # Install Codex
```

## Usage

```bash
tako                          # Interactive TUI launcher
tako --claude                 # Quick-launch Claude Code
tako --codex                  # Quick-launch Codex
tako --gemini                 # Quick-launch Gemini CLI
tako agent --model <model>    # Start agent mode with specific model
```

## Skills

Tako bundles reusable skills for AI agents. Install them into your project:

```bash
tako skill list               # Show available skills
tako skill install --all      # Install all skills to .claude/skills/
tako skill install model-benchmark   # Install specific skill
```

Skills are installed to `.claude/skills/<name>/SKILL.md` and automatically picked up by Claude Code.

### Available Skills

| Skill | Description |
|-------|-------------|
| model-benchmark | Model capability scores and recommendations from E2E testing across 16 models |

## Features

- Unified launcher for multiple AI coding tools
- Agent system with ACP protocol support
- Model switching without affecting other sessions
- Provider management (Tako API, local models)
- Bundled skills for AI agent enhancement

## Development

```bash
bun install
bun run build
bun test
```

## License

MIT
