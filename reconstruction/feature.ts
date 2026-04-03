import featureConfigJson from './features.json'
import { parseAndValidateFeatureConfig } from './config.js'

const featureConfig = parseAndValidateFeatureConfig(featureConfigJson)
const featureFlags = featureConfig.flags

export function feature(name: string): boolean {
  return featureFlags[name] === true
}
