import { analyzeFrame } from './analysis/features.ts'
import { FrameSampler } from './analysis/frameSampler.ts'
import type { FramePlanes, PixelFrame } from './analysis/types.ts'
import { AudioEngine } from './audio/engine.ts'
import type { RulesetRunner } from './mapping/runner.ts'
import type { TickSummary } from './mapping/types.ts'
import { useJukebox } from './store.ts'
import {
  type DateLabel,
  formatDate,
  formatMonthYear,
  labelAt,
  parseLabels,
  shouldAnnounceMonth,
} from './tracks/labels.ts'
import type { Track } from './tracks/types.ts'
import { formatSpokenTime } from './ui/format.ts'

/** Analysis frame width in pixels; height follows the video's shape. */
const ANALYSIS_WIDTH = 160
/**
 * Notes sound this long after their place in the video. A tick boundary is
 * only noticed on the next frame, up to 33 ms late, so a fixed delay a little
 * longer than that lets every note land exactly on the grid.
 */
const AUDIO_DELAY = 0.06
/** A jump in video time larger than this (or backwards) is a seek or a loop. */
const DISCONTINUITY = 0.5
const READOUT_INTERVAL_MS = 120
const SEEK_STEP = 5
const MONTH_ANNOUNCE_GAP = 4

/**
 * Glue between the layers: video frames -> analysis -> mapping -> audio, plus
 * the store that the UI reads. Sound is generated only from frames that are
 * actually presented, which is what keeps it locked to the picture.
 */
export class JukeboxPlayer {
  readonly track: Track
  readonly engine = new AudioEngine()
  private video: HTMLVideoElement | null = null
  private sampler: FrameSampler | null = null
  private runner: RulesetRunner | null
  private prev: FramePlanes | null = null
  private lastMediaTime: number | null = null
  private labels: (DateLabel | null)[] = []
  private lastMonth: string | null = null
  private lastMonthAt = -Infinity
  private lastReadoutAt = 0
  private lastTick: TickSummary | null = null
  private padLevel = 0
  private analysisMs = 0

  constructor(track: Track) {
    this.track = track
    this.runner = track.createRunner ? track.createRunner() : null
  }

  /** Connect to a video element. Returns a function that disconnects again. */
  attach(video: HTMLVideoElement): () => void {
    this.video = video
    const store = useJukebox.getState()
    store.patch({ status: 'loading', time: 0, duration: 0, error: null, readout: null })

    const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => {
      video.addEventListener(type, fn)
      return () => video.removeEventListener(type, fn)
    }
    const set = (partial: Parameters<typeof store.patch>[0]) => useJukebox.getState().patch(partial)
    const ready = () => {
      if (useJukebox.getState().status === 'loading') set({ status: 'ready' })
      set({ duration: video.duration || 0 })
    }

    const off = [
      on('loadedmetadata', ready),
      on('canplay', ready),
      on('playing', () => {
        set({ status: 'playing' })
        this.engine.setActive(true)
      }),
      on('pause', () => {
        set({ status: 'paused', time: video.currentTime })
        this.engine.setActive(false)
        this.runner?.reset()
      }),
      on('waiting', () => this.engine.setActive(false)),
      on('seeking', () => {
        this.engine.setActive(false)
        this.resetAnalysis()
      }),
      on('seeked', () => {
        set({ time: video.currentTime })
        if (!video.paused) this.engine.setActive(true)
      }),
      on('timeupdate', () => set({ time: video.currentTime })),
      on('error', () => {
        set({ status: 'error', error: 'The video could not be loaded.' })
        useJukebox.getState().announce('The video could not be loaded.')
      }),
    ]
    if (video.readyState >= 1) ready()

    // Browsers stop delivering video frames to a hidden tab, so the sustained
    // sounds would hang at a stale level. Fade them out until the tab is back.
    const onVisibility = () => this.engine.setActive(!document.hidden && !video.paused)
    document.addEventListener('visibilitychange', onVisibility)
    off.push(() => document.removeEventListener('visibilitychange', onVisibility))

    this.sampler = new FrameSampler(video, ANALYSIS_WIDTH)
    this.sampler.start((frame, mediaTime) => this.onFrame(frame, mediaTime))
    void this.loadLabels()
    store.announce(`Track: ${this.track.title}. Press Space to play.`)

    return () => {
      off.forEach((remove) => remove())
      this.sampler?.stop()
      this.sampler = null
      this.video = null
      this.engine.setActive(false)
    }
  }

  private async loadLabels(): Promise<void> {
    const source = this.track.timeLabels
    if (!source) return
    try {
      const response = await fetch(source.src)
      if (!response.ok) throw new Error(String(response.status))
      this.labels = parseLabels(await response.text(), source.yearCorrections)
      this.updateDate(this.video?.currentTime ?? 0, false)
    } catch {
      // The track still plays without dates; say so rather than showing a wrong one.
      useJukebox.getState().patch({ dateText: null })
    }
  }

  private resetAnalysis(): void {
    this.prev = null
    this.lastMediaTime = null
    this.runner?.reset()
  }

  private onFrame(frame: PixelFrame, mediaTime: number): void {
    const video = this.video
    if (!video) return
    const last = this.lastMediaTime
    if (last !== null && (mediaTime < last - 0.001 || mediaTime - last > DISCONTINUITY)) {
      // A seek, a loop, or frames stopped arriving (a hidden tab): comparing against
      // the old frame would be meaningless, and the old hum level is stale.
      this.resetAnalysis()
      this.engine.setPad(0)
      this.padLevel = 0
    }

    const started = performance.now()
    const { features, planes } = analyzeFrame(frame, this.prev, {
      ...this.runner?.analysis,
      masks: this.track.masks,
    })
    this.prev = planes
    this.lastMediaTime = mediaTime

    const playing = !video.paused && !video.seeking
    if (playing && this.runner) {
      const output = this.runner.step(features, mediaTime)
      if (this.engine.isStarted) {
        const now = this.engine.currentTime()
        this.engine.playNotes(
          output.notes.map((n) => ({
            at: now + AUDIO_DELAY + (n.time - mediaTime),
            midi: n.midi,
            pan: n.pan,
            velocity: n.velocity,
          })),
        )
        if (output.pad) this.engine.setPad(output.pad.level)
      }
      if (output.pad) this.padLevel = output.pad.level
      if (output.tick) this.lastTick = output.tick
    }
    const elapsed = performance.now() - started
    this.analysisMs = this.analysisMs ? this.analysisMs * 0.9 + elapsed * 0.1 : elapsed

    this.updateDate(mediaTime, playing)

    const nowMs = performance.now()
    if (nowMs - this.lastReadoutAt >= READOUT_INTERVAL_MS) {
      this.lastReadoutAt = nowMs
      const level = this.engine.level()
      useJukebox.getState().patch({
        time: mediaTime,
        readout: {
          width: features.width,
          height: features.height,
          meanLuminance: features.meanLuminance,
          diff: features.diff,
          signalMean: features.signalMean,
          columnLuminance: features.columnLuminance,
          rowLuminance: features.rowLuminance,
          hueHistogram: features.hueHistogram,
          dominantHue: features.dominantHues[0]?.hue ?? null,
          centroid: features.centroid,
          brightSpots: features.brightSpots.length,
          risingPixels: features.risingPixels.length,
          tickFlashCount: this.lastTick?.flashCount ?? 0,
          tickClusters: this.lastTick?.clusterCount ?? 0,
          tickNotes: this.lastTick?.notesPlayed ?? 0,
          padLevel: this.padLevel,
          analysisMs: this.analysisMs,
          outputDb: level.db,
          peakDb: level.peakDb,
          notesTotal: level.notes,
          exactFrames: this.sampler?.exactFrames ?? false,
        },
      })
    }
  }

  private updateDate(time: number, playing: boolean): void {
    const source = this.track.timeLabels
    if (!source || !this.labels.length) return
    const label = labelAt(this.labels, time, source.sourceFps)
    if (!label) return
    const text = formatDate(label)
    const state = useJukebox.getState()
    if (state.dateText !== text) state.patch({ dateText: text, dateCorrected: label.corrected })
    if (!playing) return
    const month = formatMonthYear(label)
    const seconds = performance.now() / 1000
    if (shouldAnnounceMonth(month, this.lastMonth, seconds - this.lastMonthAt, MONTH_ANNOUNCE_GAP)) {
      this.lastMonth = month
      this.lastMonthAt = seconds
      state.announce(month)
    }
  }

  /** Play or pause. The first call also starts the audio engine (needs a user gesture). */
  async toggle(): Promise<void> {
    const video = this.video
    if (!video) return
    const { announce, patch } = useJukebox.getState()
    if (!video.paused) {
      video.pause()
      announce(`Paused at ${formatSpokenTime(video.currentTime)}.`)
      return
    }
    try {
      await this.engine.start()
      patch({ audioOn: true })
    } catch {
      announce('Sound could not be started in this browser.')
    }
    try {
      await video.play()
      // Hold the first month announcement back so it does not talk over this one.
      this.lastMonthAt = performance.now() / 1000
      announce(`Playing ${this.track.title}.`)
    } catch {
      announce('The video could not be played.')
    }
  }

  /** Skip forwards or backwards by a number of seconds. */
  seekBy(seconds: number): void {
    const video = this.video
    if (!video || !Number.isFinite(video.duration)) return
    this.seekTo(video.currentTime + seconds)
  }

  seekTo(seconds: number, announce = true): void {
    const video = this.video
    if (!video || !Number.isFinite(video.duration)) return
    const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.05))
    video.currentTime = target
    useJukebox.getState().patch({ time: target })
    if (announce) useJukebox.getState().announce(`Moved to ${formatSpokenTime(target)}.`)
  }

  static readonly seekStep = SEEK_STEP
}
