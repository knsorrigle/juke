import { analyzeFrame } from './analysis/features.ts'
import { FrameSampler } from './analysis/frameSampler.ts'
import type { FramePlanes, PixelFrame } from './analysis/types.ts'
import { AudioEngine } from './audio/engine.ts'
import { isDiscontinuity, smoothOffset } from './mapping/clock.ts'
import type { RulesetRunner } from './mapping/runner.ts'
import type { Knobs } from './mapping/types.ts'
import { type JukeboxState, useJukebox } from './store.ts'
import {
  type DateLabel,
  formatDate,
  formatMonthYear,
  labelAt,
  parseLabels,
} from './tracks/labels.ts'
import type { TimeDescription, Track } from './tracks/types.ts'
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

/**
 * Glue between the layers: video frames -> analysis -> mapping -> audio, plus
 * the store that the UI reads. Sound is generated only from frames that are
 * actually presented, which is what keeps it locked to the picture.
 */
export class JukeboxPlayer {
  readonly engine = new AudioEngine()
  private track: Track
  private runner: RulesetRunner
  private video: HTMLVideoElement | null = null
  private sampler: FrameSampler | null = null
  private prev: FramePlanes | null = null
  private lastMediaTime: number | null = null
  /** Smoothed (audio clock - video time), so notes follow an even timeline. */
  private clockOffset: number | null = null
  private labels: (DateLabel | null)[] = []
  private lastSpokenKey: string | null = null
  private lastSpokenAt = -Infinity
  private lastReadoutAt = 0
  private info: Record<string, string> = {}
  private analysisMs = 0
  private resumeAfterLoad = false

  constructor(track: Track) {
    this.track = track
    this.runner = track.createRunner()
    this.ensureKnobs()
  }

  get currentTrack(): Track {
    return this.track
  }

  /** Instruments that keys 1-4 solo on this track. */
  get soloable(): { id: string; label: string }[] {
    return this.runner.soloable.map((id) => ({
      id,
      label: this.runner.instruments.find((i) => i.id === id)?.label ?? id,
    }))
  }

  private ensureKnobs(): void {
    const state = useJukebox.getState()
    if (!state.knobs[this.track.id]) {
      state.patch({ knobs: { ...state.knobs, [this.track.id]: { ...this.runner.knobs } } })
    }
  }

  private knobs(): Knobs {
    return useJukebox.getState().knobs[this.track.id] ?? this.runner.knobs
  }

  /** Connect to a video element. Returns a function that disconnects again. */
  attach(video: HTMLVideoElement): () => void {
    this.video = video
    const set = (partial: Partial<JukeboxState>) => useJukebox.getState().patch(partial)
    set({ status: 'loading', time: 0, duration: 0, error: null, readout: null })

    const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => {
      video.addEventListener(type, fn)
      return () => video.removeEventListener(type, fn)
    }
    const ready = () => {
      if (useJukebox.getState().status === 'loading') set({ status: 'ready' })
      set({ duration: video.duration || 0 })
      if (this.resumeAfterLoad) {
        this.resumeAfterLoad = false
        void video.play()
      }
    }

    const off = [
      on('loadedmetadata', ready),
      on('canplay', ready),
      on('playing', () => {
        set({ status: 'playing' })
        this.engine.setActive(true)
      }),
      on('pause', () => {
        if (this.resumeAfterLoad) return // a track switch, not a real pause
        set({ status: 'paused', time: video.currentTime })
        this.engine.setActive(false)
        this.resetAnalysis()
      }),
      on('waiting', () => this.engine.setActive(false)),
      on('seeking', () => {
        this.engine.setActive(false)
        this.resetAnalysis()
      }),
      on('seeked', () => {
        set({ time: video.currentTime })
        if (video.paused) {
          // No frame callback is guaranteed here, so refresh the readout and date by hand.
          this.resetAnalysis()
          this.sampler?.sampleNow()
        } else {
          this.engine.setActive(true)
        }
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

    // Knob changes from the debug panel reach the engine straight away.
    off.push(
      useJukebox.subscribe((s, p) => {
        const knobs = s.knobs[this.track.id]
        if (s.knobs !== p.knobs && knobs) this.engine.setKnobs(knobs)
      }),
    )

    this.sampler = new FrameSampler(video, ANALYSIS_WIDTH)
    this.sampler.start((frame, mediaTime) => this.onFrame(frame, mediaTime))
    this.engine.loadTrack(this.runner.instruments, this.knobs())
    void this.loadLabels()
    useJukebox.getState().announce(`Track: ${this.track.title}. Press Space to play.`)

    return () => {
      off.forEach((remove) => remove())
      this.sampler?.stop()
      this.sampler = null
      this.video = null
      this.engine.setActive(false)
    }
  }

  /**
   * Switch to another track. The UI changes the video's source; the sound
   * crossfades from the old track's instruments to the new ones.
   */
  selectTrack(track: Track, keepPlaying: boolean): void {
    if (track.id === this.track.id) return
    this.track = track
    this.runner = track.createRunner()
    this.ensureKnobs()
    this.labels = []
    this.lastSpokenKey = null
    this.info = {}
    this.resumeAfterLoad = keepPlaying
    this.resetAnalysis()
    this.engine.loadTrack(this.runner.instruments, this.knobs())
    useJukebox.getState().patch({
      trackId: track.id,
      status: 'loading',
      time: 0,
      duration: 0,
      dateText: null,
      dateCorrected: false,
      scanX: null,
      solo: null,
      readout: null,
      error: null,
    })
    useJukebox.getState().announce(`${track.title}.${keepPlaying ? '' : ' Press Space to play.'}`)
    void this.loadLabels()
  }

  private async loadLabels(): Promise<void> {
    const source = this.track.timeLabels
    if (!source) return
    const trackId = this.track.id
    try {
      const response = await fetch(source.src)
      if (!response.ok) throw new Error(String(response.status))
      const labels = parseLabels(await response.text(), source.yearCorrections)
      if (this.track.id !== trackId) return // switched away meanwhile
      this.labels = labels
      this.updateDate(this.video?.currentTime ?? 0, false)
    } catch {
      // The track still plays without dates; say so rather than showing a wrong one.
      useJukebox.getState().patch({ dateText: null })
    }
  }

  private resetAnalysis(): void {
    this.prev = null
    this.lastMediaTime = null
    this.clockOffset = null
    this.runner.reset()
    this.engine.silenceSustains()
  }

  private onFrame(frame: PixelFrame, mediaTime: number): void {
    const video = this.video
    if (!video) return
    if (isDiscontinuity(this.lastMediaTime, mediaTime, DISCONTINUITY)) {
      // A seek, a loop, or frames stopped arriving (a hidden tab): comparing against
      // the old frame would be meaningless, and the old levels are stale.
      this.resetAnalysis()
    }

    const started = performance.now()
    const { features, planes } = analyzeFrame(frame, this.prev, {
      ...this.runner.analysis,
      masks: this.track.masks,
    })
    this.prev = planes
    this.lastMediaTime = mediaTime

    const playing = !video.paused && !video.seeking
    let scanX: number | null = null
    if (playing) {
      const output = this.runner.step(features, mediaTime, this.knobs())
      if (this.engine.isStarted) {
        const offset = smoothOffset(this.clockOffset, this.engine.currentTime() - mediaTime)
        this.clockOffset = offset
        this.engine.playNotes(output.notes.map((n) => ({ ...n, at: offset + n.time + AUDIO_DELAY })))
        if (output.voices) this.engine.setVoices(output.voices)
      }
      if (output.info) this.info = output.info
      scanX = output.scanX ?? null
      if (output.announce) useJukebox.getState().announce(output.announce)
    }
    if (useJukebox.getState().scanX !== scanX) useJukebox.getState().patch({ scanX })
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
          columnLuminance: features.columnLuminance,
          rowLuminance: features.rowLuminance,
          hueHistogram: features.hueHistogram,
          dominantHue: features.dominantHues[0]?.hue ?? null,
          centroid: features.centroid,
          info: this.info,
          analysisMs: this.analysisMs,
          outputDb: level.db,
          peakDb: level.peakDb,
          notesTotal: level.notes,
          exactFrames: this.sampler?.exactFrames ?? false,
        },
      })
    }
  }

  /** What to show and say about the moment on screen. */
  private describe(time: number): (TimeDescription & { corrected?: boolean }) | null {
    if (this.track.describeTime) return this.track.describeTime(time)
    const source = this.track.timeLabels
    if (!source || !this.labels.length) return null
    const label = labelAt(this.labels, time, source.sourceFps)
    if (!label) return null
    const month = formatMonthYear(label)
    return { text: formatDate(label), spoken: month, key: month, minGap: 4, corrected: label.corrected }
  }

  private updateDate(time: number, playing: boolean): void {
    const d = this.describe(time)
    if (!d) return
    const state = useJukebox.getState()
    if (state.dateText !== d.text) state.patch({ dateText: d.text, dateCorrected: Boolean(d.corrected) })
    if (!playing || d.key === this.lastSpokenKey) return
    const seconds = performance.now() / 1000
    if (d.urgent || seconds - this.lastSpokenAt >= d.minGap) {
      this.lastSpokenKey = d.key
      this.lastSpokenAt = seconds
      state.announce(d.spoken)
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
      // Hold the first date announcement back so it does not talk over this one.
      this.lastSpokenAt = performance.now() / 1000
      announce(`Playing ${this.track.title}.`)
    } catch {
      announce('The video could not be played.')
    }
  }

  /** Keys 1-4: hear one instrument alone; the same key again restores all. */
  toggleSolo(index: number): void {
    const target = this.soloable[index]
    const { announce, patch, solo } = useJukebox.getState()
    if (!target) {
      announce(
        this.soloable.length
          ? `This track has ${this.soloable.length} instruments.`
          : 'This track has no separate instruments to solo.',
      )
      return
    }
    const next = solo === target.id ? null : target.id
    this.engine.setSolo(next)
    patch({ solo: next })
    announce(next ? `Solo: ${target.label}. Press ${index + 1} again to hear everything.` : 'All instruments.')
  }

  /** Speak the plain-language legend. */
  speakLegend(): void {
    useJukebox.getState().announce(`What you are hearing. ${this.track.legend.join(' ')}`)
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
