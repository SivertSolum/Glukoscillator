# Glukoscillator — Claude Code

`AGENTS.md` is the single source of truth for project instructions (shared with Cursor and other agents). It is imported below; edit `AGENTS.md`, not this file, when conventions change.

@AGENTS.md

## Claude Code notes

- Shell: Windows. PowerShell is the primary shell; Git Bash is also available. Commands in `AGENTS.md` are written for PowerShell.
- Verification: `npm run build` must pass. For audio/UI changes, run `npm run dev` and check in a browser; there is no automated test suite.
- Keep docs current in the same change (see **Documentation** in `AGENTS.md`).
