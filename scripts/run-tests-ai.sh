#!/bin/bash

set -o errexit

bun scripts/run-tests-ai.ts "$@"
status=$?
bash scripts/notify-test-done.sh "$status"
exit "$status"
