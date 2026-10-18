// Fixed before any comparison. README.md defines the sets and interpretation.
export const RULE = Object.freeze({
  games: 60,
  draws: 2000,
  seed: 20261014,
  alpha: 0.05,
  effects: 7,
  agreement: 0.05,
  qualityMargin: 0.01,
  referenceNodes: 7_500_000,
  referenceMultiPv: 3,
  referenceAttempts: 2,
  profiles: ['phone', 'desktop', 'routine'],
  devices: ['phone', 'desktop'],
})
