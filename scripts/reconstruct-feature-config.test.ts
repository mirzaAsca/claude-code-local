import { describe, expect, test } from 'bun:test'
import type { FeatureConfig } from '../reconstruction/config.js'
import {
  FEATURE_FLAG_KEYS,
  parseAndValidateFeatureConfig,
} from '../reconstruction/config.js'

function makeValidFeatureConfig(): FeatureConfig {
  const flags = Object.fromEntries(
    FEATURE_FLAG_KEYS.map((key) => [key, false]),
  ) as FeatureConfig['flags']

  return {
    version: 1,
    generatedAt: '2026-04-03T00:00:00.000Z',
    notes: 'test',
    flags: {
      ...flags,
      BRIDGE_MODE: true,
    },
  }
}

describe('parseAndValidateFeatureConfig', () => {
  test('accepts a valid feature config', () => {
    const config = makeValidFeatureConfig()
    expect(parseAndValidateFeatureConfig(config)).toEqual(config)
  })

  test('rejects unknown top-level keys', () => {
    const config = {
      ...makeValidFeatureConfig(),
      extra: true,
    }

    expect(() => parseAndValidateFeatureConfig(config)).toThrow(
      'reconstruction/features.json has unknown key: extra',
    )
  })

  test('rejects non-positive version values', () => {
    const config = {
      ...makeValidFeatureConfig(),
      version: 0,
    }

    expect(() => parseAndValidateFeatureConfig(config)).toThrow(
      'reconstruction/features.json version must be a positive integer',
    )
  })

  test('rejects unknown feature flag keys', () => {
    const config = makeValidFeatureConfig() as FeatureConfig & {
      flags: Record<string, unknown>
    }
    config.flags = {
      ...config.flags,
      INVALID_FLAG: true,
    }

    expect(() => parseAndValidateFeatureConfig(config)).toThrow(
      'reconstruction/features.json flags has unknown key: INVALID_FLAG',
    )
  })

  test('rejects missing required feature flags', () => {
    const config = makeValidFeatureConfig() as FeatureConfig & {
      flags: Record<string, unknown>
    }
    delete config.flags.BRIDGE_MODE

    expect(() => parseAndValidateFeatureConfig(config)).toThrow(
      'reconstruction/features.json flags is missing required key: BRIDGE_MODE',
    )
  })

  test('rejects non-boolean feature flag values', () => {
    const config = makeValidFeatureConfig() as FeatureConfig & {
      flags: Record<string, unknown>
    }
    config.flags.BRIDGE_MODE = 'true'

    expect(() => parseAndValidateFeatureConfig(config)).toThrow(
      'reconstruction/features.json flags.BRIDGE_MODE must be a boolean',
    )
  })
})
