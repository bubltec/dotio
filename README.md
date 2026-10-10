# bubbletech.io

The splash page for **bubbletech** and the [github.com/bubltec](https://github.com/bubltec) org,
in the same NES Mega Man style as [greed](../greed). It lists the projects:

- [greed.bubbletech.io](https://greed.bubbletech.io)
- [badthingsforpets.com](https://badthingsforpets.com)
- [sloth.bubbletech.io](https://sloth.bubbletech.io)

`https://www.bubbletech.io/*` redirects (301) to `https://bubbletech.io/*`.

## Layout

```
site/        The whole site: plain HTML + CSS, no build step
infra/cdk    DotioCi (mycota GithubActionsDeployRole), DotioWaf (shared web ACL), DotioSite (S3 + CloudFront + Route53)
docs/        Deployment
```

## Run locally

```bash
nvm use                 # Node 26
pnpm install
pnpm dev                # http://localhost:5180
```

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
```

To add a project, add an `<li>` to the stage grid in `site/index.html` (replace the `???` slot or
add beside it).

See [docs/deploy.md](docs/deploy.md) for AWS and GitHub setup.
