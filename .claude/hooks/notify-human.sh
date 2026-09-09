#!/bin/bash
# Fires on Notification events (permission prompts, elicitation dialogs, and
# idle waits) so you don't miss an agent that's stuck waiting on you.
#
# Note: as of this writing, Claude Code's Notification hook does not yet have
# a dedicated matcher for AskUserQuestion specifically (it's an open feature
# request upstream) — but idle_prompt will still catch it, just with up to a
# ~60s delay after the agent stops and waits. Check the terminal panel
# directly if you want a zero-delay view of who's blocked.

INPUT=$(cat)
TITLE=$(echo "$INPUT" | jq -r '.title // "Claude Code"')
MSG=$(echo "$INPUT" | jq -r '.message // "An agent needs your input"')

if command -v notify-send >/dev/null 2>&1; then
  notify-send "$TITLE" "$MSG" --icon=dialog-question
elif command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"$MSG\" with title \"$TITLE\""
elif command -v afplay >/dev/null 2>&1; then
  afplay /System/Library/Sounds/Ping.aiff
fi
