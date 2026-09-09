# Handoff: AI Software Company on Claude Code

## Objective

Automate the software development lifecycle using multiple Claude agents acting as distinct roles in a software company — Product Manager, Business Analyst, System Architect, Designer, Developer, Code Reviewer, QA, DevOps — starting from an existing SRS/user stories document, with a human in the loop for approvals and for resolving genuine ambiguity.

## Decision trail — what we considered and why we landed here

| Option | Verdict | Reason |
|---|---|---|
| **Claude Code subagents** (basic) | Rejected as primary mechanism | Each subagent is isolated — one prompt in, one result out, no lateral talk. Fine for parallel research tasks, wrong shape for a team that needs to argue, hand off, and loop back. |
| **Claude Agent SDK** (custom-built app) | Parked for later | Right choice if this becomes a standalone product with a non-technical UI. Overkill as a starting point — more code to build before you see the workflow run at all. |
| **Paperclip** (AI-employee orchestration platform) | Rejected for this use case | Excellent governance/budget/audit layer, but agent "communication" is async ticket comments and heartbeats, not live cross-talk. You explicitly needed agents to talk to each other. |
| **MetaGPT / ChatDev** (academic AI-software-company frameworks) | Rejected | Philosophically the closest match (PM/architect/engineer/QA roles, SOP-driven handoffs) but they generate code via LLM completions rather than a real tool-using agentic loop (file edits, test execution, iteration). Code quality and reliability trail a real coding agent. ChatDev in particular is under-maintained today. |
| **Claude Code Agent Teams** ✅ | **Chosen** | Real Claude Code tool-use (file edits, bash, tests) *plus* native peer-to-peer messaging between teammates, a shared task list as the built-in ticket system, and hooks for inserting human checkpoints. The only option that had both "real hands" and "real cross-talk." |

**Net result:** the team runs on Claude Code's experimental **Agent Teams** feature. Tickets are the native shared Task list (no external Jira/Linear needed to start). Two layers of human-in-the-loop: Claude Code's own permission prompts for actions, plus a custom `[NEEDS-APPROVAL]` hook for milestone sign-offs, plus per-agent instructions to escalate confusion straight to you via `AskUserQuestion`.

## The team (8 roles) and what each does with your SRS

| Order | Role | Reads | Produces | Hands off to |
|---|---|---|---|---|
| 1 | **Product Manager** | Your SRS | `docs/product/PRD.md` — vision, prioritized epics, open questions. Epic tickets. | Business Analyst |
| 2 | **Business Analyst** | PRD, epics, SRS | `docs/product/stories/*.md` — user stories with Given/When/Then acceptance criteria. Story tickets. | System Architect + Designer (parallel) |
| 3 | **System Architect** | Stories | `docs/architecture/` — system design, data model, API contracts, ADRs. | Developer + DevOps |
| 3 | **Designer** *(parallel)* | Stories | `docs/design/*.md` — flows, wireframes, component states, accessibility notes. | Developer |
| 4 | **Developer** | Story + architecture + design | Working code + tests, per ticket. | Code Reviewer |
| 5 | **Code Reviewer** | Diff, story, architecture | Approval or blocking feedback (never edits code). | QA (on approval) / back to Developer |
| 6 | **QA** | Approved diff, acceptance criteria | Independent test execution; bug tickets on failure. | DevOps (on pass) / back to Developer (on fail) |
| 7 | **DevOps** | Architecture, QA sign-off | CI/CD, environments, deployment. Blocks promotion past staging without QA sign-off. | Production |

Loops are by design: bugs go QA → Developer, architectural gaps go Developer → Architect, ambiguity in a story goes anyone → BA. Agent Teams' direct messaging carries this without you relaying it.

## Human-in-the-loop mechanisms (three layers)

1. **Claude Code's normal permission system** — every file write / bash command from any teammate still surfaces to you per your configured permission mode. Unchanged by this setup.
2. **`[NEEDS-APPROVAL]` ticket hook** (`approval-gate.sh`, on `TaskCompleted`) — a coarser, milestone-level gate. Tag any ticket `[NEEDS-APPROVAL]` (PRD, architecture sign-off, pre-deploy by default) and it cannot be marked complete until you add `[APPROVED]`.
3. **Confusion escalation** — every agent has `AskUserQuestion` and a standing rule: if a teammate can't resolve something in one exchange, the SRS/story/design is silent or contradictory, or the call carries real cost/security/legal/scope weight, escalate straight to you rather than guessing. `notify-human.sh` (on `Notification`) pings you when an agent is waiting — with the caveat that `AskUserQuestion` doesn't yet have a dedicated instant-fire matcher upstream, so there can be up to ~60s lag; the terminal panel is the zero-delay source of truth.

## Files delivered (`claude-agents-setup.zip`)

```
claude-agents-setup/
├── README.md                       ← install steps + workflow table + notes
├── settings.json                   ← enables Agent Teams, wires both hooks
├── agents/
│   ├── product-manager.md
│   ├── business-analyst.md
│   ├── system-architect.md
│   ├── designer.md
│   ├── developer.md
│   ├── code-reviewer.md
│   ├── qa-engineer.md
│   └── devops.md
└── hooks/
    ├── approval-gate.sh            ← blocks [NEEDS-APPROVAL] tickets until [APPROVED]
    └── notify-human.sh             ← desktop notification when an agent needs you
```

## Setup, in short

1. Copy `agents/*.md` → `.claude/agents/`, `hooks/*.sh` → `.claude/hooks/` (`chmod +x` them).
2. Merge `settings.json` into your project's `.claude/settings.json`.
3. Put your SRS at `docs/requirements/SRS.md`.
4. Run `claude`, then ask the lead to read the SRS and spawn the full team, tagging PRD/architecture tickets `[NEEDS-APPROVAL]`.
5. Work from the agent panel: check transcripts, message teammates directly, approve gated tickets as they come up.

## Open items / next steps

- **Agent Teams is experimental** — expect rough edges (e.g. teammates aren't restored across `/resume`). Treat this as a working prototype, not a hardened production pipeline yet.
- **Start with one epic**, not the full SRS at once, to see the PM→BA→Architect/Designer→Developer→Reviewer→QA→DevOps loop run end to end before scaling up.
- **Ticketing is the native Task list for now.** If you outgrow it, swap the `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate` tools in each agent file for a connected MCP server (GitHub Issues, Linear, Jira) — the role prompts themselves don't need to change.
- **Revisit the Agent SDK** if this graduates from "your own workflow" to "a product other people use" — that's the path to a real UI instead of the Claude Code terminal panel.
- **Tune permission modes** to reduce day-to-day approval friction on low-risk paths (e.g. auto-approve edits under `docs/` or `src/`) while keeping the two milestone/escalation layers above intact.
