import type { Command } from '../../commands.js'
import { hasAnthropicApiKeyAuth } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

function safeHasApiKeyAuth(): boolean {
  try {
    return hasAnthropicApiKeyAuth()
  } catch {
    return false
  }
}

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: safeHasApiKeyAuth()
      ? 'Switch Anthropic accounts'
      : 'Sign in with your Anthropic account',
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command
