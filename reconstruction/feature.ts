import featureConfigJson from './features.json'

type FeatureConfig = {
  version: number
  generatedAt: string
  notes?: string
  flags?: Record<string, boolean>
}

const featureConfig = featureConfigJson as FeatureConfig
const featureFlags = featureConfig.flags ?? {}

export function feature(name: string): boolean {
  return featureFlags[name] === true
}
