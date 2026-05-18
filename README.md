# RoPA Register

A self-hostable **GDPR Records of Processing Activities (RoPA)** register. It
helps an organisation maintain its Article 30 register of processing
activities, plus a second register for international data-transfer assessments.

## What it is

A small, single-tenant web app you deploy into your own AWS account.

Key features:

- **Dual register** — one register for processing activities (GDPR Art. 30),
  and a separate register for international data-transfer assessments
  (vendors, transfer mechanisms, TIAs, DPAs).
- **Guided wizard + quick form** — capture a record step by step, or use a
  compact single-page form once you know the fields.
- **SSO** — sign in via your existing identity provider (Google Workspace by
  default) through an AWS Cognito user pool.
- **Role model** — read / edit / admin. Anyone on your allowed email domain
  gets read (and edit by default); admins manage everyone else and the
  organisation settings.
- **Change log & version history** — every record keeps an audit trail.
- **Export** — Excel, PDF and CSV export for both registers.
- **Optional Slack notifications** — channel webhook on new submissions, and a
  "nudge owner" direct message. Entirely opt-in.

## Screenshots

_Add screenshots here._

## Architecture

A React single-page app is hosted on S3 and served through CloudFront. The same
CloudFront distribution proxies `/api/*` to an API Gateway REST API backed by a
single AWS Lambda function. The Lambda stores everything in one DynamoDB table
(single-table design). Authentication uses an AWS Cognito user pool with a
SAML/social identity provider.

AWS services used:

- S3 + CloudFront — static hosting and CDN
- API Gateway (REST) + Lambda — the API
- DynamoDB — data store (single table)
- Cognito — authentication / SSO
- Secrets Manager — optional, only for Slack credentials

Everything is provisioned with the AWS CDK (v2) in the `infra/` directory.

## Prerequisites

- An AWS account and credentials configured locally.
- Node.js 20+ and npm.
- AWS CDK v2 (`npm install -g aws-cdk`, or use `npx cdk`).
- A **Cognito user pool** with a SAML or social identity provider already
  configured (e.g. Google Workspace). This app does not create the user pool
  or the IdP — it attaches its own app client to an existing pool. See the AWS
  docs on
  [adding a SAML identity provider](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-saml-idp.html)
  or
  [social identity providers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp.html).

## Configuration

All configuration is passed as CDK context (set in `infra/cdk.json` or with
`-c key=value`). The CDK stack then sets the matching Lambda environment
variables and writes the frontend runtime config.

| Context value (`infra/cdk.json`) | Required | Description |
|---|---|---|
| `sharedUserPoolId` | yes | ID of the existing Cognito user pool. |
| `sharedCognitoDomain` | yes | Cognito Hosted UI domain, e.g. `https://your-domain.auth.eu-west-1.amazoncognito.com`. |
| `allowedEmailDomain` | yes | Email domain whose users get read/edit access, e.g. `example.com`. |
| `initialAdminEmail` | yes | Email seeded as the first admin on first run. |
| `identityProviderName` | no | IdP name as configured on the user pool. Defaults to `GoogleWorkspace`. |
| `appName` | no | Display name shown in the UI and notifications. Defaults to `RoPA Register`. |
| `slackWebhookSecretName` | no | Secrets Manager secret name holding a Slack channel webhook URL. Enables channel notifications when set. |
| `slackBotTokenSecretName` | no | Secrets Manager secret name holding a Slack bot token. Enables the "nudge owner" DM feature when set. |

The Lambda environment variables (`ALLOWED_EMAIL_DOMAIN`, `INITIAL_ADMIN_EMAIL`,
`IDENTITY_PROVIDER_NAME`, `APP_NAME`, `APP_BASE_URL`, `ACTIVITIES_TABLE`,
`SLACK_*`) are all derived from the context above by the CDK stack — see
`.env.example` for what each one does if you want to run the Lambda locally.

## Deploy

1. **Install frontend dependencies and build:**

   ```bash
   npm install
   npm run build
   ```

2. **Configure the infrastructure.** Edit `infra/cdk.json` and fill in the
   required context values from the table above.

3. **Deploy the stack:**

   ```bash
   cd infra
   npm install
   npx cdk deploy
   ```

   The stack provisions the S3 bucket, CloudFront distribution, API Gateway,
   Lambda, DynamoDB table and Cognito app client. It also writes the frontend
   runtime `config.json` into the S3 bucket automatically (you do not commit a
   real `config.json`).

4. **Upload the frontend build** to the site bucket (the bucket name is a
   CDK output, `SiteBucketName`):

   ```bash
   aws s3 sync ../dist s3://YOUR_SITE_BUCKET --delete
   ```

5. **Invalidate the CloudFront cache** so the new build is served (the
   distribution ID is in the AWS console / CDK output):

   ```bash
   aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
   ```

Open the CloudFront URL (CDK output `CloudFrontDomainName`) to use the app.

## First run

The email you set as `initialAdminEmail` becomes the first admin account. Sign
in with that account, open the **Admin** page, and from there add other editors
and admins and fill in your organisation details. No other accounts are
pre-seeded.

## Data model

Two record types are stored in the single DynamoDB table:

- **Activity** — a processing activity. Fields follow GDPR Article 30:
  controller/processor role, purpose, lawful basis, data subject categories,
  personal data categories, retention, recipients, security measures (TOMs),
  DPIA status, owner, review dates, and a change log.
- **VendorTransfer** — an international data-transfer assessment for a vendor:
  data location, transfer mechanism, transfer impact assessment (TIA) status,
  data processing agreement (DPA) status, owner and change log.

A `__config__` item holds the organisation details, the edit/admin allowlists
and the TOMs library.

## Customising

- Departments, lawful bases, transfer mechanisms, data categories and the
  default TOMs library live in `src/lib/constants.ts` (frontend) and the
  matching constants in `infra/lambda/api.js` (backend validation).
- The organisation details and the editable TOMs library are managed at
  runtime from the **Admin** page.

## Disclaimer

This is a tool to help you maintain a RoPA; it is **not legal advice**. Consult
your Data Protection Officer or legal counsel on the content and completeness
of your register.

## License

MIT — see [LICENSE](./LICENSE).
