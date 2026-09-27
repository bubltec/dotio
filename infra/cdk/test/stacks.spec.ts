import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CiStack } from '../lib/ci-stack.js';
import { DOMAIN, HOSTED_ZONE_ID, WWW_DOMAIN } from '../lib/config.js';
import { SITE_DIR, SiteStack, viewerRequestCode } from '../lib/site-stack.js';

const env = { account: '123456789012', region: 'us-east-1' };

function synthSite() {
  const app = new cdk.App();
  const stack = new SiteStack(app, 'DotioSite', {
    env,
    domainName: DOMAIN,
    wwwDomainName: WWW_DOMAIN,
    hostedZoneId: HOSTED_ZONE_ID,
  });
  return Template.fromStack(stack);
}

type Handler = (event: unknown) => { statusCode?: number; headers?: Record<string, { value: string }>; uri?: string };

function handler(): Handler {
  const sandbox: { handler?: Handler } = {};
  runInNewContext(viewerRequestCode(DOMAIN, WWW_DOMAIN), sandbox);
  return sandbox.handler!;
}

const request = (host: string, uri: string, querystring: Record<string, unknown> = {}) => ({
  request: { uri, headers: { host: { value: host } }, querystring },
});

describe('www redirect function', () => {
  it('301s www to the apex, keeping path and query', () => {
    const res = handler()(request(WWW_DOMAIN, '/a/b', { x: { value: '1' }, flag: { value: '' } }));
    expect(res.statusCode).toBe(301);
    expect(res.headers?.location?.value).toBe('https://bubbletech.io/a/b?x=1&flag');
  });

  it('keeps repeated query parameters', () => {
    const res = handler()(request(WWW_DOMAIN, '/', { t: { value: '2', multiValue: [{ value: '1' }, { value: '2' }] } }));
    expect(res.headers?.location?.value).toBe('https://bubbletech.io/?t=1&t=2');
  });

  it('passes apex requests through untouched', () => {
    const res = handler()(request(DOMAIN, '/index.html'));
    expect(res.statusCode).toBeUndefined();
    expect(res.uri).toBe('/index.html');
  });
});

describe('DotioSite', () => {
  const template = synthSite();

  it('serves both hostnames from one distribution with the redirect attached', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: [DOMAIN, WWW_DOMAIN],
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
        }),
      }),
    });
  });

  it('covers apex and www in one certificate', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: DOMAIN,
      SubjectAlternativeNames: [WWW_DOMAIN],
    });
  });

  it('adds A and AAAA aliases for both names in the existing zone, and creates no zone', () => {
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
    template.resourceCountIs('AWS::Route53::RecordSet', 4);
    for (const Name of [`${DOMAIN}.`, `${WWW_DOMAIN}.`]) {
      for (const Type of ['A', 'AAAA']) {
        template.hasResourceProperties('AWS::Route53::RecordSet', { Name, Type, HostedZoneId: HOSTED_ZONE_ID });
      }
    }
  });

  it('keeps the bucket private', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('ships the pages the distribution points at', () => {
    for (const file of ['index.html', '404.html', 'robots.txt']) {
      expect(existsSync(path.join(SITE_DIR, file)), file).toBe(true);
    }
  });
});

describe('DotioCi', () => {
  it('trusts only this repo on main and the production environment', () => {
    const app = new cdk.App();
    const template = Template.fromStack(new CiStack(app, 'DotioCi', { env }));
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'dotio-gha-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:bubltec@310348769/dotio@1391053204:ref:refs/heads/main',
                  'repo:bubltec@310348769/dotio@1391053204:environment:production',
                ],
              },
            }),
          }),
        ],
      }),
    });
  });
});
