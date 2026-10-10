import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

/** One protected site: matched by Host header, rate limited per client IP. */
export interface WafSite {
  /** Rule + metric name fragment, e.g. `greed`. */
  name: string;
  /** Exact Host header values (case-insensitive) this limit applies to. */
  hosts: string[];
  /** Max requests per client IP per 5 minutes. */
  limit: number;
}

export interface WafStackProps extends cdk.StackProps {
  sites: WafSite[];
  /** SSM parameter (same account and region) that publishes the ACL ARN to the other repos. */
  arnParameterName: string;
}

/** Rule fragments become metric names, so keep them to what CloudWatch accepts. */
const NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * The one CLOUDFRONT-scope web ACL shared by every bubbletech distribution
 * (this site, greed, sloth, badthingsforpets prod), so the account pays for one
 * ACL instead of one per project. Each site gets its own rate rule scoped by
 * Host header, so a busy site cannot spend another site's budget. The ARN is
 * published to SSM; the other repos read it and pass it as `webAclId`.
 */
export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, props);

    const rules: wafv2.CfnWebACL.RuleProperty[] = props.sites.map((site, priority) => {
      if (!NAME_RE.test(site.name)) throw new Error(`Invalid WAF site name: ${site.name}`);
      if (site.hosts.length === 0) throw new Error(`WAF site ${site.name} needs at least one host`);
      const hostMatches = site.hosts.map(
        (host): wafv2.CfnWebACL.StatementProperty => ({
          byteMatchStatement: {
            searchString: host.toLowerCase(),
            fieldToMatch: { singleHeader: { Name: 'host' } },
            textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
            positionalConstraint: 'EXACTLY',
          },
        }),
      );
      return {
        name: `RateLimit-${site.name}`,
        priority,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: site.limit,
            aggregateKeyType: 'IP',
            scopeDownStatement: hostMatches.length === 1 ? hostMatches[0]! : { orStatement: { statements: hostMatches } },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `shared-ratelimit-${site.name}`,
          sampledRequestsEnabled: true,
        },
      };
    });

    const acl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'bubbletech-shared',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'bubbletech-shared-waf',
        sampledRequestsEnabled: true,
      },
      rules,
    });
    this.webAclArn = acl.attrArn;

    new ssm.StringParameter(this, 'WebAclArn', {
      parameterName: props.arnParameterName,
      stringValue: acl.attrArn,
      description: 'ARN of the shared bubbletech CLOUDFRONT web ACL (owned by the dotio repo).',
    });
    new cdk.CfnOutput(this, 'WebAclArnOutput', { value: acl.attrArn });
  }
}
