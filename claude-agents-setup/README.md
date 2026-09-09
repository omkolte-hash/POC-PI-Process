# Claude Code Software Company — Setup

An 8-role agent team (PM, BA, System Architect, Designer, Developer, Code Reviewer, QA, DevOps) built on Claude Code's native Agent Teams feature. Tickets are the built-in shared Task list — no external tool required. A hook enforces human sign-off at any ticket you tag `[NEEDS-APPROVAL]`.

## Install

1. **Copy the agent files** into your project:
   ```bash
   mkdir -p .claude/agents .claude/hooks
   cp agents/*.md .claude/agents/
   cp hooks/approval-gate.sh .claude/hooks/
   chmod +x .claude/hooks/approval-gate.sh
   ```

2. **Merge `settings.json`** into your project's `.claude/settings.json` (or copy it in if you don't have one yet). If you already have settings, merge the `env` and `hooks` keys rather than overwriting the file.

3. **Add your SRS**:
   ```bash
   mkdir -p docs/requirements
   cp /path/to/your/SRS.md docs/requirements/SRS.md
   ```

4. **Start Claude Code** in the project root:
   ```bash
   claude
   ```

5. **Kick off the team** with a prompt like:
   ```text
   Read docs/requirements/SRS.md. Spawn the full team — product-manager,
   business-analyst, system-architect, ux-designer, developer, code-reviewer,
   qa-engineer, devops — and have the product-manager start by turning the
   SRS into a prioritized epic backlog. Tag the PRD ticket and every
   architecture-approval ticket as [NEEDS-APPROVAL] so I sign off before
   the team moves past planning.
   ```

6. **Work the panel**: use the up/down arrows to check any teammate's transcript, Enter to open and message one directly, and respond in chat whenever a `[NEEDS-APPROVAL]` ticket needs your sign-off.

## What happens when you hand over the SRS

| Order | Role | Reads | Produces | Hands off to |
|---|---|---|---|---|
| 1 | **Product Manager** | Your SRS | `docs/product/PRD.md` — vision, prioritized epics, open questions. Epic tickets in the backlog. | Business Analyst |
| 2 | **Business Analyst** | PRD, epic tickets, SRS | `docs/product/stories/*.md` — user stories with Given/When/Then acceptance criteria. Story tickets. | System Architect + Designer (parallel) |
| 3 | **System Architect** | Stories | `docs/architecture/` — system design, data model, API contracts, ADRs. | Developer + DevOps |
| 3 | **Designer** *(parallel with Architect)* | Stories | `docs/design/*.md` — flows, wireframes, component states, accessibility notes. | Developer |
| 4 | **Developer** | Story + architecture + design spec | Working code + tests, on a ticket-by-ticket basis. | Code Reviewer |
| 5 | **Code Reviewer** | Diff, story, architecture | Approval or blocking feedback (never edits code directly). | QA (on approval) or back to Developer |
| 6 | **QA** | Approved diff, acceptance criteria | Independent test execution; bug tickets on failure. | DevOps (on pass) or back to Developer (on fail) |
| 7 | **DevOps** | Architecture, QA sign-off | CI/CD, environments, deployment. Won't promote past staging without QA sign-off. | Production |

Loops are expected and fine: a bug from QA goes back to Developer, an architectural gap Developer finds goes back to the Architect, an ambiguity anyone finds in a story goes back to the BA. That back-and-forth is exactly what Agent Teams' direct messaging is for — you don't have to relay it yourself.

## When an agent is confused

Every role now has `AskUserQuestion` and a standing instruction: if a teammate can't resolve something in one exchange, the SRS/story/design is genuinely silent or contradictory, or the decision carries real cost/security/legal/scope weight, escalate to you directly instead of guessing or bouncing it between agents indefinitely.

To make sure you actually see it — with 8 agents running, a stuck teammate can be easy to miss — `notify-human.sh` fires a desktop notification (or a sound, if no notifier is available) whenever an agent is waiting on a permission prompt or asks a question. One caveat: Claude Code doesn't yet have a dedicated instant-notification matcher for `AskUserQuestion` specifically (it falls under the general `idle_prompt` matcher, which can lag up to ~60 seconds) — check the terminal panel directly if you want a zero-delay view of who's blocked.

## Where you sit in the loop

By default, every teammate permission prompt (file writes, bash commands) already bubbles up to the lead session for your approval — that's Claude Code's normal permission system, unchanged by this setup. The `[NEEDS-APPROVAL]` hook adds a second, coarser layer on top: specific *milestones* (PRD sign-off, architecture sign-off, pre-deploy) that can't be marked done without your explicit word, regardless of how permissive your permission mode is.

Tune both to taste:
- Loosen day-to-day friction with `permissions` in `settings.json` (e.g. auto-approve routine file edits in `docs/` or `src/`) — see [permission-modes](https://code.claude.com/docs/en/permission-modes).
- Add more gates by tagging additional tickets `[NEEDS-APPROVAL]`, or edit `approval-gate.sh` to gate on other patterns (e.g. any ticket touching `payments/` or `auth/`).

## Notes

- Agent Teams is experimental — expect rough edges (see [Limitations](https://code.claude.com/docs/en/agent-teams#limitations) upstream, e.g. teammates aren't restored across `/resume`).
- Start small: kick off with one epic, not the whole SRS at once, until you've seen the loop work end to end.
- If you'd rather have an external ticket board than the built-in Task list, swap `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate` in each agent's `tools:` line for a connected MCP server (GitHub Issues, Linear, Jira) instead — the role prompts don't otherwise change.
