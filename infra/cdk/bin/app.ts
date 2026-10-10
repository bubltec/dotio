#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { CiStack } from '../lib/ci-stack.js';
import {
  AWS_ACCOUNT,
  AWS_REGION,
  DOMAIN,
  HOSTED_ZONE_ID,
  WAF_ARN_PARAMETER,
  WAF_SITES,
  WWW_DOMAIN,
} from '../lib/config.js';
import { SiteStack } from '../lib/site-stack.js';
import { WafStack } from '../lib/waf-stack.js';

const app = new cdk.App();
const env = { account: AWS_ACCOUNT, region: AWS_REGION };

// Once from a laptop, then by the deploy job: the GitHub Actions deploy role.
new CiStack(app, 'DotioCi', { env });
// The one web ACL every bubbletech distribution shares; its ARN is also in SSM.
const waf = new WafStack(app, 'DotioWaf', {
  env,
  sites: WAF_SITES,
  arnParameterName: WAF_ARN_PARAMETER,
});
// bubbletech.io + the www redirect, in the zone political-sloth's SlothDns owns.
new SiteStack(app, 'DotioSite', {
  env,
  domainName: DOMAIN,
  wwwDomainName: WWW_DOMAIN,
  hostedZoneId: HOSTED_ZONE_ID,
  webAclArn: waf.webAclArn,
});
