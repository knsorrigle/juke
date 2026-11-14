export interface DateLabel {
  day: number
  /** 0 = January. */
  month: number
  year: number
  /** True if the year shown differs from the source file. */
  corrected: boolean
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Parse a label file with one "01 Mar 2017 01:25" line per video frame.
 * Lines that do not parse become null so that line numbers still match frames.
 */
export function parseLabels(
  text: string,
  yearCorrections: { from: number; to: number }[] = [],
): (DateLabel | null)[] {
  const lines = text.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.map((line) => {
    const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/.exec(line)
    if (!m) return null
    const month = MONTHS_SHORT.findIndex((n) => n.toLowerCase() === m[2].toLowerCase())
    if (month < 0) return null
    const fileYear = Number(m[3])
    const fix = yearCorrections.find((c) => c.from === fileYear)
    return { day: Number(m[1]), month, year: fix ? fix.to : fileYear, corrected: Boolean(fix) }
  })
}

/** The label for a video time, given the frame rate the labels were written for. */
export function labelAt(
  labels: (DateLabel | null)[],
  time: number,
  sourceFps: number,
): DateLabel | null {
  if (!labels.length || !Number.isFinite(time)) return null
  const index = Math.min(labels.length - 1, Math.max(0, Math.floor(time * sourceFps + 1e-6)))
  return labels[index]
}

/** "1 Mar 2017" */
export function formatDate(label: DateLabel): string {
  return `${label.day} ${MONTHS_SHORT[label.month]} ${label.year}`
}

/** "March 2017" */
export function formatMonthYear(label: DateLabel): string {
  return `${MONTHS_LONG[label.month]} ${label.year}`
}

/**
 * Decide whether to announce a new month. Announces when the month differs from
 * the last one announced and at least `minGapSeconds` have passed, so a screen
 * reader is never flooded while months fly by.
 */
export function shouldAnnounceMonth(
  current: string,
  lastAnnounced: string | null,
  secondsSinceLast: number,
  minGapSeconds: number,
): boolean {
  return current !== lastAnnounced && secondsSinceLast >= minGapSeconds
}
