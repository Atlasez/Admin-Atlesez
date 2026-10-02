#!/usr/bin/env bash
set -euo pipefail

branch="ops/cloudflare-deployment-sync"
record="docs/deployments/cloudflare-latest.json"

case "${1:-}" in
  prepare)
    : "${GITHUB_OUTPUT:?GITHUB_OUTPUT must point to a writable file}"
    if git fetch origin "+refs/heads/${branch}:refs/remotes/origin/${branch}"; then
      previous_head="$(git rev-parse "origin/${branch}")"
      git switch --create "${branch}" --track "origin/${branch}"
      git config user.name "github-actions[bot]"
      git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      git merge --no-edit origin/main
      if [[ "$(git rev-parse HEAD)" != "${previous_head}" ]]; then
        echo "base_updated=true" >> "$GITHUB_OUTPUT"
      else
        echo "base_updated=false" >> "$GITHUB_OUTPUT"
      fi
    else
      git switch --create "${branch}"
      echo "base_updated=true" >> "$GITHUB_OUTPUT"
    fi
    ;;
  persist)
    : "${GITHUB_OUTPUT:?GITHUB_OUTPUT must point to a writable file}"
    : "${BASE_UPDATED:?BASE_UPDATED must be true or false}"
    if ! git diff --quiet -- "$record"; then
      git config user.name "github-actions[bot]"
      git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      git add -- "$record"
      git commit -m "ops: record Cloudflare deployment status"
    elif [[ "$BASE_UPDATED" != "true" ]]; then
      echo "updated=false" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    git push origin "HEAD:${branch}"
    echo "updated=true" >> "$GITHUB_OUTPUT"
    ;;
  *)
    echo "Usage: $0 {prepare|persist}" >&2
    exit 2
    ;;
esac
