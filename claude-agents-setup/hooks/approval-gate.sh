#!/bin/bash
# Runs on every TaskCompleted event.
# Blocks completion (exit 2) for tickets tagged as needing a human sign-off,
# unless the ticket description already contains an explicit approval marker.
#
# Usage in tickets: tag the subject or description of any gate-worthy
# ticket with [NEEDS-APPROVAL], e.g. "[NEEDS-APPROVAL] PRD: User Auth epic".
# Once the person approves in chat, have the agent re-run TaskUpdate with
# "[APPROVED]" appended before completing it again.

INPUT=$(cat)
SUBJECT=$(echo "$INPUT" | jq -r '.task_subject // empty')
DESCRIPTION=$(echo "$INPUT" | jq -r '.task_description // empty')

GATE_PATTERN="\[NEEDS-APPROVAL\]"
APPROVED_PATTERN="\[APPROVED\]"

if echo "$SUBJECT $DESCRIPTION" | grep -qE "$GATE_PATTERN"; then
  if echo "$SUBJECT $DESCRIPTION" | grep -qE "$APPROVED_PATTERN"; then
    exit 0
  fi
  echo "This ticket is tagged [NEEDS-APPROVAL] and cannot be marked complete yet. Ask the person directly (via AskUserQuestion or a plain message) for explicit sign-off, then update the ticket to include [APPROVED] before completing it again." >&2
  exit 2
fi

exit 0
