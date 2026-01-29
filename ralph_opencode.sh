#!/usr/bin/env bash
set -euo pipefail

MAX_ITERS="${MAX_ITERS:-30}"

# Optional: attach to an already-running opencode server.
# Usage:
#   ./ralph_opencode.sh --attach http://localhost:4096
# Or env:
#   OPENCODE_ATTACH_URL=http://localhost:4096 ./ralph_opencode.sh
ATTACH_URL="${OPENCODE_ATTACH_URL:-${ATTACH_URL:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --attach)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --attach requires a URL argument" >&2
        exit 64
      fi
      ATTACH_URL="$2"
      shift 2
      ;;
    --attach=*)
      ATTACH_URL="${1#--attach=}"
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ralph_opencode.sh [--attach URL]

Options:
  --attach URL   Attach to an opencode server (e.g. http://localhost:4096)

Env:
  OPENCODE_ATTACH_URL  Same as --attach
EOF
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 64
      ;;
  esac
done

# 1) Auto-pick the first change name listed under "Changes:" (most recent in your example).
CHANGE_NAME="$(
  openspec list 2>/dev/null \
  | awk '
      BEGIN{in_changes=0}
      /^Changes:/ {in_changes=1; next}
      in_changes && NF>0 {
        # first column is change name
        print $1; exit
      }
    '
)"

if [[ -z "${CHANGE_NAME:-}" ]]; then
  echo "ERROR: Could not determine CHANGE_NAME from: openspec list"
  exit 1
fi

TASKS_FILE="openspec/changes/${CHANGE_NAME}/tasks.md"

if [[ ! -f "$TASKS_FILE" ]]; then
  echo "ERROR: tasks file not found: $TASKS_FILE"
  exit 1
fi

# Return next unchecked task id like 1, 1.1, 2.3, etc.
next_task_id() {
  # Matches lines like: "- [ ] 1.2 Something"
  grep -nE '^- \[ \] [0-9]+(\.[0-9]+)*([[:space:]]|$)' "$TASKS_FILE" \
    | head -n 1 \
    | sed -E 's/^([0-9]+):- \[ \] ([0-9]+(\.[0-9]+)*)([[:space:]]|$).*/\2/'
}

# True if there are no unchecked tasks left
all_done() {
  ! grep -qE '^- \[ \] [0-9]+(\.[0-9]+)*([[:space:]]|$)' "$TASKS_FILE"
}

# True if a specific task id is checked off
is_task_done() {
  local tid="$1"
  # Escape literal dots in the task id for grep -E.
  local tid_re="${tid//./\.}"
  grep -qE "^- \[x\] ${tid_re}([[:space:]]|$)" "$TASKS_FILE"
}

# Print the full markdown block for a given task id.
# Includes any indented sub-bullets directly under the task line.
task_block() {
  local tid="$1"
  awk -v tid="$tid" '
    BEGIN {
      tid_re = tid
      # Escape literal dots in the task id for ERE.
      gsub(/\./, "\\.", tid_re)
    }
    function is_task_line(line) {
      return line ~ /^- \[[ x]\] [0-9]+(\.[0-9]+)*([[:space:]]|$)/
    }
    {
      # Once we are inside the requested task, stop when we hit the next task.
      if (in_block && is_task_line($0) && $0 !~ ("^- \\[[ x]\\] " tid_re "([[:space:]]|$)")) {
        exit
      }

      if ($0 ~ ("^- \\[[ x]\\] " tid_re "([[:space:]]|$)")) {
        in_block = 1
      }

      if (in_block) {
        print
      }
    }
  ' "$TASKS_FILE"
}

echo "Change     : $CHANGE_NAME"
echo "Tasks file : $TASKS_FILE"
echo "Max iters  : $MAX_ITERS"
if [[ -n "${ATTACH_URL:-}" ]]; then
  echo "Attach    : $ATTACH_URL"
fi
echo

for iter in $(seq 1 "$MAX_ITERS"); do
  if all_done; then
    echo "✅ All tasks completed. Stopping early (iteration $iter)."
    exit 0
  fi

  tid="$(next_task_id || true)"
  if [[ -z "${tid:-}" ]]; then
    echo "ERROR: Could not find next unchecked task in $TASKS_FILE"
    exit 2
  fi

  echo "== Iteration $iter / $MAX_ITERS : task $tid =="

  TASK_BLOCK="$(task_block "$tid" || true)"
  if [[ -z "${TASK_BLOCK:-}" ]]; then
    echo "ERROR: Could not extract task block for task $tid from $TASKS_FILE" >&2
    exit 2
  fi

  OPENCODE_RUN=(opencode run)
  if [[ -n "${ATTACH_URL:-}" ]]; then
    OPENCODE_RUN+=(--attach "$ATTACH_URL")
  fi
  OPENCODE_RUN+=(use skills openspec-apply-change to apply)

  # Require the agent to:
  # - do ONLY this task id
  # - tick ONLY this checkbox in tasks.md when done
  cat <<EOF | "${OPENCODE_RUN[@]}"
Target change: $CHANGE_NAME
Tasks file: $TASKS_FILE

Work on EXACTLY ONE task: $tid
Task details (verbatim from tasks.md):
$TASK_BLOCK

- Only implement work for task $tid
- Do NOT start or modify other task ids
- If it is a test/qa/review and it fail, fix it
- When finished, mark ONLY task $tid as done in $TASKS_FILE by changing:
  - [ ] $tid  ->  - [x] $tid
EOF

  # Verify the agent actually checked off the task.
  if ! is_task_done "$tid"; then
    echo "❌ Task $tid was NOT marked done in $TASKS_FILE after iteration $iter."
    echo "   Refusing to continue to avoid looping blindly."
    exit 3
  fi

  echo "✅ Task $tid completed."
  echo
done

# If we used all iterations, still stop cleanly if it finished exactly at the end.
if all_done; then
  echo "✅ All tasks completed."
  exit 0
fi

echo "⚠️ Hit MAX_ITERS=$MAX_ITERS but tasks still remain unfinished."
exit 4