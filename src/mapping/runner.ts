import type { AnalysisOptions, FrameFeatures } from '../analysis/types.ts'
import type { InstrumentSpec, Knobs, MappingOutput, Ruleset } from './types.ts'

/** A ruleset together with its running state, so callers need not know the state's type. */
export interface RulesetRunner {
  analysis: Partial<AnalysisOptions>
  instruments: InstrumentSpec[]
  knobs: Knobs
  soloable: string[]
  /** Forget everything: call after a seek, a loop or a pause. */
  reset(): void
  step(features: FrameFeatures, time: number, knobs: Knobs): MappingOutput
}

export function createRunner<S>(ruleset: Ruleset<S>): RulesetRunner {
  let state = ruleset.createState()
  return {
    analysis: ruleset.analysis,
    instruments: ruleset.instruments,
    knobs: ruleset.knobs,
    soloable: ruleset.soloable ?? [],
    reset() {
      state = ruleset.createState()
    },
    step(features, time, knobs) {
      const result = ruleset.step(features, time, state, knobs)
      state = result.state
      return result.output
    },
  }
}
