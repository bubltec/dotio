/** The org's apex domain. Its zone is owned by political-sloth's SlothDns stack. */
export const DOMAIN = 'bubbletech.io';
/** Redirected (301) to DOMAIN at the edge. */
export const WWW_DOMAIN = `www.${DOMAIN}`;

// The existing bubbletech.io zone (SlothDns `ParentZone`), same value greed's
// cdk.context.json lookup resolves. Pinned so CI never needs a lookup role.
export const HOSTED_ZONE_ID = 'Z08503632G57OD1I2BJ7V';

/** Where the shared web ACL's ARN is published for greed, political-sloth and btfp to read. */
export const WAF_ARN_PARAMETER = '/bubbletech/waf/web-acl-arn';

/**
 * Sites behind the shared ACL, each with its own per-IP rate limit (requests per
 * 5 minutes). Limits match what each project used before sharing.
 */
export const WAF_SITES = [
  { name: 'dotio', hosts: [DOMAIN, WWW_DOMAIN], limit: 1000 },
  { name: 'greed', hosts: ['greed.bubbletech.io'], limit: 1000 },
  { name: 'sloth', hosts: ['sloth.bubbletech.io'], limit: 1000 },
  { name: 'btfp', hosts: ['badthingsforpets.com', 'www.badthingsforpets.com'], limit: 2000 },
];

// us-east-1 for everything: CloudFront's ACM certificate and CLOUDFRONT-scope WAF must live here.
export const AWS_REGION = 'us-east-1';
// Same account as btfp/greed/grtzplz/political-sloth (see cdk.context.json).
export const AWS_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT ?? '288892511071';

// The bubltec org has GitHub's immutable-ID OIDC claims on, so the trust policy
// needs `owner@ownerId/repo@repoId`. Ids from the GitHub API:
// org bubltec = 310348769, repo bubltec/dotio = 1391053204.
export const GITHUB_REPO = 'bubltec@310348769/dotio@1391053204';
