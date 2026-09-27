#!/usr/bin/env bash
# One-time GitHub settings for bubltec/dotio, mirroring greed and btfp:
#   - squash-only merges, linear history, delete merged branches
#   - `main-merge` ruleset: PR required (1 approval), `CI / check` required,
#     no force-push or deletion; repo admins may bypass *via PR only*, so a solo
#     maintainer can merge their own PR but nobody can push straight to main
#   - a `production` environment that needs your approval
#   - the AWS_DEPLOY_ROLE_ARN secret the deploy workflow reads
#
# Needs: gh (authenticated as a bubltec admin) and the DeployRoleArn output of
# `npx cdk deploy DotioCi`. Safe to re-run: every call is a PUT/upsert.
set -euo pipefail
REPO=bubltec/dotio

echo "== repository merge settings"
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -f squash_merge_commit_title=PR_TITLE >/dev/null

echo "== environments"
ME_ID=$(gh api user --jq .id)
gh api -X PUT "repos/$REPO/environments/production" --input - >/dev/null <<JSON
{
  "reviewers": [{ "type": "User", "id": $ME_ID }],
  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
}
JSON

echo "== main-merge ruleset"
RULESET_ID=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="main-merge") | .id' || true)
METHOD=POST; URL="repos/$REPO/rulesets"
if [ -n "$RULESET_ID" ]; then METHOD=PUT; URL="repos/$REPO/rulesets/$RULESET_ID"; fi
gh api -X "$METHOD" "$URL" --input - >/dev/null <<'JSON'
{
  "name": "main-merge",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "check" }]
    } }
  ]
}
JSON

echo "== Actions secrets"
: "${AWS_DEPLOY_ROLE_ARN:?set AWS_DEPLOY_ROLE_ARN to the DotioCi DeployRoleArn output}"
gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$AWS_DEPLOY_ROLE_ARN"

echo "Done. Check Settings → Rules, Environments, and Secrets and variables → Actions."
