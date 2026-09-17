#!/usr/bin/env bash
# Pre-commit helper: runs eslint or prettier on the staged files matching the given
# git pathspecs, then re-stages what the tool fixed.
#
# The staged file list is read from git here instead of being interpolated into the
# hook command, so route files such as `$clientId.tsx` are never re-parsed by a shell.
# Works with the macOS system bash (3.2).
set -euo pipefail

tool="$1"
shift

# Git GUIs may not carry the shell's PATH; load the Node version the repo expects.
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use --silent
fi

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z -- "$@")

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

case "$tool" in
  eslint) corepack pnpm exec eslint --fix "${files[@]}" ;;
  prettier) corepack pnpm exec prettier --write "${files[@]}" ;;
  *)
    echo "Unknown tool: $tool" >&2
    exit 1
    ;;
esac

git add -- "${files[@]}"
