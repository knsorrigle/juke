import { analyzeFrame } from './analysis/features.ts'
import { FrameSampler, downscaleSteps } from './analysis/frameSampler.ts'
import type { FrameFeatures, FramePlanes, PixelFrame } from './analysis/types.ts'
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
import { getTrack } from './tracks/index.ts'
import type { TimeDescription, Track } from './tracks/types.ts'
import { MOMENT_SETS } from './eartest/moments.ts'
import {
  type Difficulty,
  type Question,
  type Side,
  loadBest,
  makeRound,
  revealText,
  saveBest,
} from './eartest/questions.ts'
import { describePlace } from './explore/place.ts'
import { type CellPixels, PROBES, type ProbeResult } from './explore/probes.ts'
import { formatSpokenTime } from './ui/format.ts'
import { ripples } from './ui/ripples.ts'
import { describeFrame } from './ui/describe.ts'

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
/** Explore grid: this many cells across; rows follow the video's shape. */
const EXPLORE_COLS = 64
/** Width the paused frame is captured at for Explore (5 pixels per cell). */
const EXPLORE_WIDTH = 320

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
  private lastFeatures: FrameFeatures | null = null
  private exploreFrame: PixelFrame | null = null
  private exploreCanvases: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = []
  private probe: ProbeResult | null = null
  /** Recent note times per instrument, for the caption bar. */
  private recentNotes = new Map<string, number[]>()
  private voiceLevels = new Map<string, number>()
  private round: Question[] = []
  private toneTimer = 0
  private padTimers: number[] = []

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
          if (useJukebox.getState().mode === 'explore') this.captureExplore()
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
    this.exitExplore(false)
    this.exitEarTest(false)
    this.track = track
    this.runner = track.createRunner()
    this.ensureKnobs()
    this.labels = []
    this.lastSpokenKey = null
    this.info = {}
    this.resumeAfterLoad = keepPlaying
    this.resetAnalysis()
    this.engine.loadTrack(this.runner.instruments, this.knobs())
    this.dropNeedle()
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
    this.lastFeatures = features

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
      this.emitRipples(output.notes)
      const now = performance.now()
      for (const n of output.notes) {
        const list = this.recentNotes.get(n.voice) ?? []
        list.push(now)
        this.recentNotes.set(n.voice, list)
      }
      if (output.voices) for (const [id, v] of Object.entries(output.voices)) this.voiceLevels.set(id, v.level)
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
        sounding: this.caption(playing),
      })
    }
  }

  /** Show each note as a ripple on the video at the moment it sounds. */
  private emitRipples(notes: { voice: string; time: number; x?: number; y?: number; velocity: number }[]): void {
    const mediaNow = this.video?.currentTime ?? 0
    const { solo } = useJukebox.getState()
    for (const n of notes) {
      if (n.x === undefined || n.y === undefined || (solo && solo !== n.voice)) continue
      const color = this.runner.instruments.find((i) => i.id === n.voice)?.color ?? '#ffffff'
      const delay = Math.max(0, (n.time - mediaNow + AUDIO_DELAY) * 1000)
      const ripple = { x: n.x, y: n.y, color, velocity: n.velocity }
      window.setTimeout(() => ripples.emit(ripple), delay)
    }
  }

  /** What is sounding, in words, for the visible caption bar. */
  private caption(playing: boolean): string {
    const state = useJukebox.getState()
    if (state.mode === 'explore') {
      return this.probe ? `Explore tone: ${this.probe.text}` : 'Explore: move the cursor.'
    }
    if (!playing) return 'Silent: paused.'
    if (!state.audioOn) return 'Sound is off until you press play.'
    const now = performance.now()
    const parts: string[] = []
    for (const inst of this.runner.instruments) {
      if (state.solo && state.solo !== inst.id) continue
      const times = (this.recentNotes.get(inst.id) ?? []).filter((t) => now - t < 2000)
      this.recentNotes.set(inst.id, times)
      if (times.length) parts.push(`${inst.label}: ${Math.round(times.length / 2)} notes a second`)
      const level = this.voiceLevels.get(inst.id)
      if (level !== undefined && level > 0.04) parts.push(`${inst.label}: ${Math.round(level * 100)}%`)
    }
    return parts.length ? parts.join(' · ') : 'Quiet: nothing to sound right now.'
  }

  // ---------------------------------------------------------------- Explore

  /** Pause and explore the frame on screen with a cursor. Starts sound if needed. */
  async enterExplore(): Promise<void> {
    const video = this.video
    if (!video) return
    if (!video.paused) video.pause()
    try {
      await this.engine.start()
      useJukebox.getState().patch({ audioOn: true })
    } catch {
      useJukebox.getState().announce('Sound could not be started in this browser.')
    }
    const rows = Math.max(1, Math.round((EXPLORE_COLS * (video.videoHeight || 1)) / (video.videoWidth || 2)))
    const { cursor } = useJukebox.getState()
    const col = Math.min(EXPLORE_COLS - 1, Math.round((cursor.col / cursor.cols) * EXPLORE_COLS))
    const row = Math.min(rows - 1, Math.round((cursor.row / cursor.rows) * rows))
    useJukebox.getState().patch({ mode: 'explore', cursor: { col, row, cols: EXPLORE_COLS, rows } })
    this.captureExplore()
    useJukebox
      .getState()
      .announce(
        `Explore. Arrow keys move the cursor, Shift and an arrow moves 10. I says what is under it, F describes the frame. ${this.probe ? this.probe.text : ''} Press 1 or Space to play again.`,
      )
  }

  /** Back to Play mode, paused where it was. */
  exitExplore(announce = true): void {
    if (useJukebox.getState().mode !== 'explore') return
    this.engine.setExplore(null)
    this.probe = null
    useJukebox.getState().patch({ mode: 'play', probeText: '' })
    if (announce) useJukebox.getState().announce('Play mode. Press Space to play.')
  }

  /** Draw the paused frame at Explore resolution. */
  private captureExplore(): void {
    const video = this.video
    if (!video || !video.videoWidth) return
    const steps = downscaleSteps(video.videoWidth, video.videoHeight, EXPLORE_WIDTH)
    if (this.exploreCanvases.length !== steps.length || this.exploreCanvases.at(-1)?.canvas.height !== steps.at(-1)!.height) {
      this.exploreCanvases = steps.map((size, i) => {
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const ctx = canvas.getContext('2d', { willReadFrequently: i === steps.length - 1 })!
        ctx.imageSmoothingQuality = 'high'
        return { canvas, ctx }
      })
    }
    let source: CanvasImageSource = video
    for (const { canvas, ctx } of this.exploreCanvases) {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
      source = canvas
    }
    const last = this.exploreCanvases.at(-1)!
    const image = last.ctx.getImageData(0, 0, last.canvas.width, last.canvas.height)
    this.exploreFrame = { data: image.data, width: image.width, height: image.height }
    this.updateProbe()
  }

  /** Move the Explore cursor by whole cells. */
  moveCursor(dCol: number, dRow: number): void {
    const { cursor } = useJukebox.getState()
    const col = Math.min(cursor.cols - 1, Math.max(0, cursor.col + dCol))
    const row = Math.min(cursor.rows - 1, Math.max(0, cursor.row + dRow))
    if (col === cursor.col && row === cursor.row) {
      useJukebox.getState().announce('Edge of the picture.')
      return
    }
    useJukebox.getState().patch({ cursor: { ...cursor, col, row } })
    this.updateProbe()
  }

  /** Put the Explore cursor at a point (0..1 from the top-left), e.g. from a pointer. */
  setCursorAt(x: number, y: number): void {
    const { cursor } = useJukebox.getState()
    const col = Math.min(cursor.cols - 1, Math.max(0, Math.floor(x * cursor.cols)))
    const row = Math.min(cursor.rows - 1, Math.max(0, Math.floor(y * cursor.rows)))
    if (col === cursor.col && row === cursor.row) return
    useJukebox.getState().patch({ cursor: { ...cursor, col, row } })
    this.updateProbe()
  }

  private cursorCentre(): { x: number; y: number } {
    const { cursor } = useJukebox.getState()
    return { x: (cursor.col + 0.5) / cursor.cols, y: (cursor.row + 0.5) / cursor.rows }
  }

  private updateProbe(): void {
    const frame = this.exploreFrame
    if (!frame) return
    const { cursor } = useJukebox.getState()
    const { x, y } = this.cursorCentre()
    const masked = this.track.masks.some((m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height)
    let result: ProbeResult
    if (masked) {
      result = { value: null, text: 'A label on the picture, not data.', noData: 'noise' }
    } else {
      const x0 = Math.floor((cursor.col / cursor.cols) * frame.width)
      const x1 = Math.max(x0 + 1, Math.floor(((cursor.col + 1) / cursor.cols) * frame.width))
      const y0 = Math.floor((cursor.row / cursor.rows) * frame.height)
      const y1 = Math.max(y0 + 1, Math.floor(((cursor.row + 1) / cursor.rows) * frame.height))
      const pixels: CellPixels = []
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const p = (py * frame.width + px) * 4
          pixels.push([frame.data[p], frame.data[p + 1], frame.data[p + 2]])
        }
      }
      result = PROBES[this.track.id](pixels, this.video?.currentTime ?? 0)
    }
    this.probe = result
    this.engine.setExplore({
      midi: 48 + 36 * Math.min(1, Math.max(0, result.value ?? 0)),
      pan: (x - 0.5) * 2,
      sound: result.value === null ? (result.noData ?? 'silence') : 'tone',
    })
    useJukebox.getState().patch({ probeText: result.text, sounding: `Explore tone: ${result.text}` })
  }

  // ---------------------------------------------------------------- Ear Test

  private earView() {
    return useJukebox.getState().earTest
  }

  private setEar(partial: Partial<ReturnType<JukeboxPlayer['earView']>>) {
    useJukebox.getState().patch({ earTest: { ...this.earView(), ...partial } })
  }

  /** Key 4: a listening quiz. Pauses the track; nothing on screen hints at the answer. */
  async enterEarTest(): Promise<void> {
    const video = this.video
    if (video && !video.paused) video.pause()
    this.exitExplore(false)
    try {
      await this.engine.start()
      useJukebox.getState().patch({ audioOn: true })
    } catch {
      useJukebox.getState().announce('Sound could not be started in this browser.')
      return
    }
    this.engine.setActive(false)
    const best = loadBest(typeof localStorage === 'undefined' ? undefined : localStorage)
    useJukebox.getState().patch({ mode: 'eartest', sounding: 'Ear Test: waiting to start.' })
    this.setEar({ phase: 'setup', index: 0, total: 0, score: 0, prompt: '', reveal: '', best })
    useJukebox
      .getState()
      .announce(
        `Ear Test. Eight questions. Each plays two tones, left ear then right; a higher tone means more. Answer with the Left or Right arrow. Choose easy, medium or hard, then press Space to start. Current: ${this.earView().difficulty}.`,
      )
  }

  exitEarTest(announce = true): void {
    if (useJukebox.getState().mode !== 'eartest') return
    window.clearTimeout(this.toneTimer)
    useJukebox.getState().patch({ mode: 'play', sounding: '' })
    if (announce) useJukebox.getState().announce('Play mode. Press Space to play.')
  }

  setDifficulty(difficulty: Difficulty): void {
    this.setEar({ difficulty })
    useJukebox.getState().announce(`${difficulty[0].toUpperCase()}${difficulty.slice(1)}.`)
  }

  startRound(): void {
    const { difficulty } = this.earView()
    this.round = makeRound(MOMENT_SETS, difficulty, Math.random)
    this.setEar({ phase: 'asking', index: 0, total: this.round.length, score: 0, reveal: '' })
    this.askQuestion()
  }

  private askQuestion(): void {
    const { index, total } = this.earView()
    const q = this.round[index]
    const prompt = `Question ${index + 1} of ${total}. Which has ${q.ask} ${q.set.question}: left or right?`
    this.setEar({ phase: 'asking', prompt, reveal: '', moments: null })
    useJukebox.getState().announce(`${prompt} Space plays the tones again.`)
    // Give the screen reader a moment to speak before the tones.
    window.clearTimeout(this.toneTimer)
    this.toneTimer = window.setTimeout(() => this.playTones(), 2600)
  }

  /** Play the two tones: left ear, then right. */
  playTones(): void {
    const q = this.round[this.earView().index]
    if (!q || useJukebox.getState().mode !== 'eartest') return
    this.engine.playTestTone(q.leftMidi, -1, 0.05, 0.9)
    this.engine.playTestTone(q.rightMidi, 1, 1.25, 0.9)
    // Light each pad while its tone sounds.
    this.padTimers.forEach((t) => window.clearTimeout(t))
    const at = (ms: number, lit: 'left' | 'right' | null) =>
      window.setTimeout(() => this.setEar({ lit }), ms)
    this.padTimers = [at(50, 'left'), at(950, null), at(1250, 'right'), at(2150, null)]
    useJukebox.getState().patch({ sounding: 'Ear Test: left tone, then right tone.' })
  }

  answer(side: Side): void {
    const view = this.earView()
    const q = this.round[view.index]
    if (view.phase !== 'asking' || !q) return
    window.clearTimeout(this.toneTimer)
    const right = side === q.correct
    const score = view.score + (right ? 1 : 0)
    const title = getTrack(q.set.trackId)?.shortTitle ?? q.set.trackId
    const reveal = `${right ? 'Correct.' : `Not quite: it was ${q.correct}.`} ${revealText(q, title)}`
    const last = view.index + 1 >= view.total
    this.padTimers.forEach((t) => window.clearTimeout(t))
    this.setEar({
      phase: 'revealed',
      score,
      reveal,
      lit: null,
      moments: {
        trackId: q.set.trackId,
        left: { time: q.left.time, label: q.left.label },
        right: { time: q.right.time, label: q.right.label },
        correct: q.correct,
        answered: side,
      },
    })
    useJukebox.getState().announce(`${reveal} ${last ? 'Press Space for your score.' : 'Press Space for the next question.'}`)
  }

  /** Space in the Ear Test: start, replay the tones, or move on. */
  earSpace(): void {
    const view = this.earView()
    if (view.phase === 'setup' || view.phase === 'done') return this.startRound()
    if (view.phase === 'asking') return this.playTones()
    if (view.index + 1 < view.total) {
      this.setEar({ index: view.index + 1 })
      return this.askQuestion()
    }
    const best = saveBest(typeof localStorage === 'undefined' ? undefined : localStorage, view.difficulty, view.score)
    this.setEar({ phase: 'done', best, prompt: '' })
    useJukebox
      .getState()
      .announce(
        `Round over: ${view.score} out of ${view.total} on ${view.difficulty}. Your best on ${view.difficulty} is ${best[view.difficulty]}. Space plays another round, 1 goes back to the music.`,
      )
  }

  /** H key: everything the HUD shows, in words. */
  speakHud(): void {
    const state = useJukebox.getState()
    const modeName = { play: 'Play', explore: 'Explore', eartest: 'Ear Test' }[state.mode]
    const parts = [`${modeName} mode, ${this.track.shortTitle}.`]
    if (state.dateText) parts.push(`${state.dateText}.`)
    if (state.mode === 'explore' && this.probe) {
      const { x, y } = this.cursorCentre()
      parts.push(`${this.probe.text} ${describePlace(x, y, this.track.geographic)}.`)
    } else {
      for (const [k, v] of Object.entries(state.readout?.info ?? {}).slice(0, 2)) parts.push(`${k}: ${v}.`)
    }
    parts.push(`Legend: ${this.track.legendShort.replaceAll(' = ', ' means ').replaceAll(' · ', '; ')}.`)
    state.announce(parts.join(' '))
  }

  /** I key: what is under the cursor, and where. */
  speakProbe(): void {
    if (useJukebox.getState().mode !== 'explore' || !this.probe) {
      useJukebox.getState().announce('Press 2 to explore the picture first.')
      return
    }
    const { x, y } = this.cursorCentre()
    useJukebox.getState().announce(`${this.probe.text} ${describePlace(x, y, this.track.geographic)}.`)
  }

  /** F (short) or G (detailed): what is on screen, with numbers from the analysis. */
  speakFrame(detailed: boolean): void {
    const features = this.lastFeatures
    if (!features) {
      useJukebox.getState().announce('No frame yet.')
      return
    }
    // A fresh copy of the rules reads this one frame without disturbing playback.
    const info = this.track.createRunner().step(features, this.video?.currentTime ?? 0, this.knobs()).info ?? {}
    const live = Object.keys(info).length ? info : (useJukebox.getState().readout?.info ?? {})
    useJukebox.getState().announce(describeFrame(this.track, features, useJukebox.getState().dateText, live, detailed))
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
    this.exitExplore(false)
    this.exitEarTest(false)
    try {
      await this.engine.start()
      patch({ audioOn: true })
    } catch {
      announce('Sound could not be started in this browser.')
    }
    try {
      await video.play()
      this.dropNeedle()
      // Hold the first date announcement back so it does not talk over this one.
      this.lastSpokenAt = performance.now() / 1000
      announce(`Playing ${this.track.title}.`)
    } catch {
      announce('The video could not be played.')
    }
  }

  /** The needle-drop cue: sound, a visible caption, and a signal for the stylus animation. */
  private dropNeedle(): void {
    if (!this.engine.isStarted) return
    this.engine.needleDrop()
    const state = useJukebox.getState()
    state.patch({ dropId: state.dropId + 1, cue: { text: 'Needle drop', at: performance.now() } })
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
    announce(next ? `Solo: ${target.label}. Press Shift and ${index + 1} again to hear everything.` : 'All instruments.')
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
