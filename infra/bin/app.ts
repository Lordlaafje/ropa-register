import * as cdk from 'aws-cdk-lib'
import { RopaAppStack } from '../lib/ropa-app-stack'

const app = new cdk.App()

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION || 'eu-west-1'

/** Read a required CDK context value, throwing a clear error if it is missing. */
function requireContext(key: string): string {
  const value = app.node.tryGetContext(key) as string | undefined
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required CDK context value "${key}". ` +
        `Set it in infra/cdk.json or pass it with -c ${key}=... (see README).`,
    )
  }
  return value.trim()
}

// --- Required configuration (no defaults — see README) ---
const userPoolId = requireContext('sharedUserPoolId')
const cognitoDomain = requireContext('sharedCognitoDomain')
const allowedEmailDomain = requireContext('allowedEmailDomain')
const initialAdminEmail = requireContext('initialAdminEmail')

// --- Optional configuration ---
// SAML/social identity provider name as configured on the Cognito user pool.
const identityProviderName =
  (app.node.tryGetContext('identityProviderName') as string) || 'GoogleWorkspace'
// Optional display name shown in the UI and notifications.
const appName = (app.node.tryGetContext('appName') as string) || 'RoPA Register'
// Optional Secrets Manager secret names — enable the Slack features only if set.
const slackWebhookSecretName =
  (app.node.tryGetContext('slackWebhookSecretName') as string) || undefined
const slackBotTokenSecretName =
  (app.node.tryGetContext('slackBotTokenSecretName') as string) || undefined

new RopaAppStack(app, 'RopaAppStack', {
  env: { account, region },
  userPoolId,
  identityProviderName,
  cognitoDomain,
  allowedEmailDomain,
  initialAdminEmail,
  appName,
  slackWebhookSecretName,
  slackBotTokenSecretName,
})
