#!/usr/bin/env bash
# notes/check.sh <branch>: a fresh clone of <branch> from this checkout, the suite on the installed claude,
# and validate --strict on the release files only (CLAUDE.md and notes/ left out). Run from anywhere in the repo.
set -u
repo=$(git rev-parse --show-toplevel)
branch=${1:?branch}
work=$(mktemp -d "${TMPDIR:-/tmp}/cachebeat-check.XXXX")
git clone -q --branch "$branch" "$repo" "$work/clone" || exit 1
mkdir "$work/rel"
(cd "$work/clone" && tar -c .claude-plugin hooks types README.md LICENSE .github) | tar -x -C "$work/rel"
echo "clone $(git -C "$work/clone" rev-parse --short HEAD) in $work · $(claude --version)"
status=0
out=$(claude plugin test "$work/clone" 2>&1)
summary=$(printf '%s\n' "$out" | grep -E '^ [0-9]+ (pass|fail)' | tr '\n' ' ')
if printf '%s\n' "$out" | grep -q "^ 0 fail"; then t=ok; else t=FAIL; status=1; printf '%s\n' "$out" | grep -E "✗|fail|error" | head -30; fi
if claude plugin validate --strict "$work/rel" >"$work/validate.txt" 2>&1 && claude plugin validate --strict "$work/rel/.claude-plugin/marketplace.json" >>"$work/validate.txt" 2>&1; then val=ok; else val=FAIL; status=1; cat "$work/validate.txt"; fi
echo "test $t ($summary) · validate $val"
exit $status
