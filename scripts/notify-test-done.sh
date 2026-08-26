#!/bin/bash

# Plays a system sound when the preceding test command finishes.
# Success -> Glass, failure -> Basso.
# Usage: <test command>; bash scripts/notify-test-done.sh "$?"
# The exit code argument is preserved as the script's exit code.

STATUS="${1:-0}"

if [ -z "${CI:-}" ] && command -v afplay >/dev/null 2>&1; then
  if [ "$STATUS" -eq 0 ]; then
    afplay /System/Library/Sounds/Glass.aiff
  else
    afplay /System/Library/Sounds/Basso.aiff
  fi
fi

exit "$STATUS"
