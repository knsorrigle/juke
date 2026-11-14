import type { AnalysisOptions, FrameFeatures } from '../analysis/types.ts'
import type { MappingOutput, Ruleset } from './types.ts'

/** A ruleset together with its running state, so callers need not know the state's type. */
export interface RulesetRunner {
  analysis: Partial<AnalysisOptions>
  /** Forget everything: call after a seek, a loop or a pause. */
  reset(): void
  step(features: FrameFeatures, time: number): MappingOutput
}

export function createRunner<S>(ruleset: Ruleset<S>): RulesetRunner {
  let state = ruleset.createState()
  return {
    analysis: ruleset.analysis,
    reset() {
      state = ruleset.createState()
    },
    step(features, time) {
      const result = ruleset.step(features, time, state)
      state = result.state
      return result.output
    },
  }
}
