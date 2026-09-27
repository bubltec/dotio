import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = path.join(__dirname, '../../../site');

export interface SiteStackProps extends cdk.StackProps {
  domainName: string;
  wwwDomainName: string;
  hostedZoneId: string;
}

/**
 * Viewer-request function: any request for the www host gets a 301 to the same
 * path on the apex, so there is one canonical origin. Everything else passes.
 */
export function viewerRequestCode(domainName: string, wwwDomainName: string): string {
  return `function handler(event) {
  var request = event.request;
  var host = request.headers.host && request.headers.host.value;
  if (host === ${JSON.stringify(wwwDomainName)}) {
    var qs = [];
    for (var key in request.querystring) {
      var param = request.querystring[key];
      if (param.multiValue) {
        for (var i = 0; i < param.multiValue.length; i++) qs.push(key + '=' + param.multiValue[i].value);
      } else {
        qs.push(param.value === '' ? key : key + '=' + param.value);
      }
    }
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + ${JSON.stringify(domainName)} + request.uri + (qs.length ? '?' + qs.join('&') : '') },
      },
    };
  }
  return request;
}`;
}

/**
 * The bubbletech.io splash page: static files from `site/` in a private S3
 * bucket behind CloudFront (OAC), one certificate for the apex and www, and
 * alias records for both in the existing bubbletech.io zone. www is redirected
 * to the apex by a CloudFront Function rather than a second bucket and
 * distribution.
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { domainName, wwwDomainName } = props;

    // Imported, never created: SlothDns owns this zone (and its MX/TXT records).
    const zone = route53.PublicHostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: domainName,
    });

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      subjectAlternativeNames: [wwwDomainName],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const redirectWww = new cloudfront.Function(this, 'RedirectWww', {
      code: cloudfront.FunctionCode.fromInline(viewerRequestCode(domainName, wwwDomainName)),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'Headers', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: false,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [domainName, wwwDomainName],
      certificate,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        functionAssociations: [{ function: redirectWww, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      // A private bucket answers 403 for missing keys; show the 404 page for both.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: cdk.Duration.minutes(5),
      })),
    });

    for (const [label, recordName] of [
      ['Apex', domainName],
      ['Www', wwwDomainName],
    ] as const) {
      for (const [type, Record] of [
        ['A', route53.ARecord],
        ['AAAA', route53.AaaaRecord],
      ] as const) {
        new Record(this, `${label}${type}`, {
          zone,
          recordName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        });
      }
    }

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(SITE_DIR)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'Url', { value: `https://${domainName}` });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
  }
}
