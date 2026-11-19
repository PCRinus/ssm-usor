#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) for this repository. The active gh login is refused with a
# 403 on PCRinus/ssm-usor, so every write to GitHub names the PCRinus token for that one
# command; screenshots live on the orphan branch pr-screenshots and nowhere else in git.
set -euo pipefail

command=$(jq -r '.tool_input.command // empty')
[ -n "$command" ] || exit 0

deny() {
  jq -nc --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# A command word, not the same words inside a commit message or a PR body.
cmdpos='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=([^[:space:]]|\$\([^)]*\))*[[:space:]]+)*'

has() {
  printf '%s' "$command" | grep -Eq -e "$1"
}

git_verb() {
  has "${cmdpos}git([[:space:]].*)?[[:space:]]$1([[:space:]]|\$)"
}

if has "${cmdpos}gh[[:space:]]+auth[[:space:]]+(switch|login|logout)([[:space:]]|\$)"; then
  deny "Do not change the active gh account. Name the PCRinus token for the one command instead: GH_TOKEN=\$(gh auth token -u PCRinus) gh ..."
fi

is_push=false
git_verb push && is_push=true
is_commit=false
git_verb commit && is_commit=true

github_write=false
if [ "$is_push" = true ] \
  || has "${cmdpos}gh[[:space:]]+(pr[[:space:]]+(create|edit|merge|ready|close|reopen|comment|review)|issue[[:space:]]+(create|edit|comment|close|reopen|delete)|release[[:space:]]+(create|edit|delete|upload)|workflow[[:space:]]+run|label[[:space:]]+(create|edit|delete))([[:space:]]|\$)" \
  || has "${cmdpos}gh[[:space:]]+api[[:space:]].*(-X|--method)[[:space:]=]*(POST|PATCH|PUT|DELETE)" \
  || has "${cmdpos}gh[[:space:]]+api[[:space:]].*[[:space:]](-f|-F|--field|--raw-field|--input)[[:space:]]"; then
  github_write=true
fi

if [ "$github_write" = true ] && [ -z "${GH_TOKEN:-}" ] \
  && ! has 'auth[[:space:]]+token[[:space:]]+(-u|--user)[[:space:]]+PCRinus'; then
  deny "This writes to GitHub as the active gh account, which this repository refuses (403). Name the PCRinus token for this command only. Push: git -c credential.helper= -c 'credential.helper=!f(){ echo username=PCRinus; echo \"password=\$(gh auth token -u PCRinus)\"; }; f' push ... ; gh: GH_TOKEN=\$(gh auth token -u PCRinus) gh ..."
fi

if [ "$is_push" = true ] && has 'pr-screenshots' \
  && printf '%s' "${command#*push}" | grep -Eq -e '(^|[[:space:]])--force' -e '(^|[[:space:]])-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$)' -e '[[:space:]"'"'"']\+[^[:space:]"'"'"']'; then
  deny "pr-screenshots is never force-pushed: it holds the screenshots of every open pull request."
fi

if { [ "$is_commit" = true ] || [ "$is_push" = true ]; } && ! has 'pr-screenshots'; then
  branch=$(git branch --show-current 2>/dev/null || true)
  if [ "$branch" != "pr-screenshots" ]; then
    added=""
    if [ "$is_commit" = true ]; then
      added=$(git diff --cached --name-only --diff-filter=A 2>/dev/null || true)
    else
      base=$(git merge-base HEAD origin/main 2>/dev/null || true)
      [ -n "$base" ] && added=$(git diff --name-only --diff-filter=A "$base" HEAD 2>/dev/null || true)
    fi
    stray=$(printf '%s\n' "$added" | grep -Ei '\.(png|jpe?g|webp|gif)$' | grep -Ev '^apps/[^/]+/(public|src/assets)/' || true)
    if [ -n "$stray" ]; then
      deny "Images outside an app's public/ or src/assets/ folder are going into this branch: $(printf '%s' "$stray" | head -5 | tr '\n' ' '). Screenshots for a pull request go on the orphan branch pr-screenshots (git worktree add /tmp/pr-screenshots pr-screenshots, copy into <branch-name>/, commit, push), never on a feature branch or main."
    fi
  fi
fi

if has "${cmdpos}(cat|head|tail|less|more|bat|nl)[[:space:]]+[^|;&]*(\.dev\.vars|\.env(\.(local|production|development))?)([[:space:]\"']|\$)"; then
  deny "Printing a secrets file puts its keys in the transcript. Read one value into a variable instead, e.g. KEY=\$(grep '^NAME=' apps/api/.dev.vars | cut -d= -f2-), and never echo it."
fi

exit 0
