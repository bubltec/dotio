# Deploying bubbletech.io

Same account and mycota pattern as greed, btfp, grtzplz and political-sloth.

| Stack | Deployed by | What |
| --- | --- | --- |
| `DotioCi` | laptop first, then the deploy job | `dotio-gha-deploy` OIDC role (mycota `GithubActionsDeployRole`) |
| `DotioWaf` | deploy job, after approval | the one shared CLOUDFRONT web ACL (per-site, per-IP rate rules matched by Host); ARN published to SSM `/bubbletech/waf/web-acl-arn` for greed, political-sloth and badthingsforpets prod to attach |
| `DotioSite` | deploy job, after approval | private S3 bucket + CloudFront (OAC), ACM cert for apex + www, A/AAAA aliases for both |

The `bubbletech.io` hosted zone is **not** created here. political-sloth's `SlothDns` owns it
(with the Google Workspace MX/TXT records); `DotioSite` imports it by id (`HOSTED_ZONE_ID` in
`infra/cdk/lib/config.ts`) and only adds its own records. The www → apex redirect is a CloudFront
Function on the same distribution, so there is no second bucket.

## One-time setup

From an AWS SSO session with account access. Run CDK through `pnpm cdk …` from the repo root
(it runs in `infra/cdk`, where `cdk.json` is); a bare `npx cdk` at the root fails with
`--app is required`.

1. **Free the apex records.** `SlothDns` used to hold A records for `bubbletech.io` and `www`
   (the old GCP site). CloudFormation cannot create a record another stack owns, so deploy
   political-sloth's `SlothDns` without `ApexA`/`WwwA` first:
   ```bash
   cd ../political-sloth && pnpm infra:dns
   ```
   The apex stops resolving from here until step 5 finishes (a few minutes, mostly the
   CloudFront distribution). MX and TXT records are untouched, so mail keeps working.
2. **Deploy role.** From the repo root: `pnpm cdk deploy DotioCi`. Keep the `DeployRoleArn` output.
3. **GitHub settings.** From the repo root, with `gh` signed in as a bubltec admin:
   ```bash
   AWS_DEPLOY_ROLE_ARN=<from step 2> ./scripts/github-setup.sh
   ```
   Squash-only merges, the `main-merge` ruleset (PR + `check` required), a `production`
   environment with you as required reviewer, and the `AWS_DEPLOY_ROLE_ARN` secret.
4. **Push.** `git push -u origin main`.
5. **First site deploy.** Either approve the `production` job of the Deploy run, or from a laptop:
   `pnpm cdk deploy DotioSite` from the repo root.
6. Check: `curl -sI https://www.bubbletech.io/x?y=1` → `301` with
   `location: https://bubbletech.io/x?y=1`.

After that, every merge to `main` that touches code or `site/` posts a diff and waits for approval.

## Cost

Close to nothing: S3 and CloudFront at splash-page traffic, one CloudFront Function, and no
extra hosted zone (the parent zone is already paid for by political-sloth).
