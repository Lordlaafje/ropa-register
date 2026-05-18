import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface RopaAppStackProps extends cdk.StackProps {
  userPoolId: string
  identityProviderName: string
  cognitoDomain: string
  allowedEmailDomain: string
  initialAdminEmail: string
  appName: string
  /** Optional — enables the Slack channel webhook notifications when set. */
  slackWebhookSecretName?: string
  /** Optional — enables the Slack "nudge owner" DM feature when set. */
  slackBotTokenSecretName?: string
}

export class RopaAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RopaAppStackProps) {
    super(scope, id, props)

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Single-table design — partition key id, GSIs for status+lastReviewedAt and department+lastReviewedAt.
    const activitiesTable = new dynamodb.Table(this, 'ActivitiesTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    activitiesTable.addGlobalSecondaryIndex({
      indexName: 'status_lastReviewedAt',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastReviewedAt', type: dynamodb.AttributeType.STRING },
    })

    activitiesTable.addGlobalSecondaryIndex({
      indexName: 'department_lastReviewedAt',
      partitionKey: { name: 'department', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastReviewedAt', type: dynamodb.AttributeType.STRING },
    })

    const lambdaSource = path.join(__dirname, '../lambda')
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'api.handler',
      code: lambda.Code.fromAsset(lambdaSource, {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              try {
                fs.cpSync(lambdaSource, outputDir, { recursive: true })
                execSync('npm install --omit=dev', { cwd: outputDir, stdio: 'inherit' })
                return true
              } catch (error) {
                console.error('Local bundling failed', error)
                return false
              }
            },
          },
          command: [
            'bash',
            '-c',
            ['cp -r /asset-input/* /asset-output/', 'cd /asset-output', 'npm install --omit=dev'].join(' && '),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      environment: {
        ACTIVITIES_TABLE: activitiesTable.tableName,
        ALLOWED_EMAIL_DOMAIN: props.allowedEmailDomain,
        INITIAL_ADMIN_EMAIL: props.initialAdminEmail,
        IDENTITY_PROVIDER_NAME: props.identityProviderName,
        APP_NAME: props.appName,
        // APP_BASE_URL is added below once the CloudFront distribution exists.
      },
    })

    activitiesTable.grantReadWriteData(apiHandler)

    // Slack integrations are opt-in: only wire the secrets when their names
    // are provided as CDK context values.
    if (props.slackWebhookSecretName) {
      apiHandler.addEnvironment('SLACK_WEBHOOK_SECRET_NAME', props.slackWebhookSecretName)
      secretsmanager.Secret.fromSecretNameV2(
        this,
        'SlackWebhookSecret',
        props.slackWebhookSecretName,
      ).grantRead(apiHandler)
    }

    if (props.slackBotTokenSecretName) {
      apiHandler.addEnvironment('SLACK_BOT_TOKEN_SECRET_NAME', props.slackBotTokenSecretName)
      secretsmanager.Secret.fromSecretNameV2(
        this,
        'SlackBotTokenSecret',
        props.slackBotTokenSecretName,
      ).grantRead(apiHandler)
    }

    const userPool = cognito.UserPool.fromUserPoolId(this, 'SharedUserPool', props.userPoolId)

    const api = new apigateway.RestApi(this, 'RopaApi', {
      restApiName: 'ropa-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowHeaders: ['*'],
        allowMethods: ['*'],
      },
    })

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'RopaAuthorizer', {
      cognitoUserPools: [userPool],
    })
    const methodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    }

    const integration = new apigateway.LambdaIntegration(apiHandler)
    const apiResource = api.root.addResource('api')
    apiResource.addMethod('ANY', integration, methodOptions)
    apiResource.addResource('{proxy+}').addMethod('ANY', integration, methodOptions)

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            `connect-src 'self' https://*.execute-api.${this.region}.amazonaws.com https://cognito-idp.${this.region}.amazonaws.com https://*.auth.${this.region}.amazoncognito.com`,
          ].join('; '),
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(730),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
            override: true,
          },
        ],
      },
    })

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity')
    siteBucket.grantRead(originAccessIdentity)

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(1) },
      ],
    })

    // Write runtime config.json — same build, different backends per environment.
    const siteOrigin = `https://${distribution.domainName}`

    // Used by the Lambda to build links in Slack notifications.
    apiHandler.addEnvironment('APP_BASE_URL', siteOrigin)

    // Dedicated app client on the user pool so callback/logout URLs are
    // independent of any other app sharing the pool.
    const userPoolClient = new cognito.UserPoolClient(this, 'RopaAppClient', {
      userPool,
      userPoolClientName: 'ropa-app',
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${siteOrigin}/auth/callback`, 'http://localhost:5173/auth/callback'],
        logoutUrls: [`${siteOrigin}/`, 'http://localhost:5173/'],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.custom(props.identityProviderName),
      ],
      preventUserExistenceErrors: true,
    })

    const config = {
      cognitoDomain: props.cognitoDomain,
      clientId: userPoolClient.userPoolClientId,
      region: this.region,
      apiBase: siteOrigin,
      callbackUrl: `${siteOrigin}/auth/callback`,
      logoutUrl: `${siteOrigin}/`,
      identityProvider: props.identityProviderName,
      appName: props.appName,
    }

    new s3deploy.BucketDeployment(this, 'RuntimeConfigDeployment', {
      sources: [s3deploy.Source.jsonData('config.json', config)],
      destinationBucket: siteBucket,
      destinationKeyPrefix: '',
      prune: false,
      distribution,
      distributionPaths: ['/config.json'],
    })

    new cdk.CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName })
    new cdk.CfnOutput(this, 'CloudFrontDomainName', { value: distribution.domainName })
    new cdk.CfnOutput(this, 'ApiBaseUrl', { value: api.url })
    new cdk.CfnOutput(this, 'ActivitiesTableName', { value: activitiesTable.tableName })
    new cdk.CfnOutput(this, 'RopaAppClientId', { value: userPoolClient.userPoolClientId })
  }
}
