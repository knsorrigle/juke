import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatMonthYear,
  labelAt,
  parseLabels,
  shouldAnnounceMonth,
} from './labels.ts'

const FILE = ['01 Mar 2017 01:25', '02 Apr 2017 00:27', '31 Dec 2022 23:10', '01 Jan 2003 04:09', ''].join(
  '\n',
)

describe('date labels', () => {
  it('parses one label per line and ignores the trailing newline', () => {
    const labels = parseLabels(FILE)
    expect(labels).toHaveLength(4)
    expect(labels[0]).toEqual({ day: 1, month: 2, year: 2017, corrected: false })
    expect(labels[3]).toEqual({ day: 1, month: 0, year: 2003, corrected: false })
  })

  it('applies a year correction and marks the label as corrected', () => {
    const labels = parseLabels(FILE, [{ from: 2003, to: 2023 }])
    expect(labels[3]).toEqual({ day: 1, month: 0, year: 2023, corrected: true })
    expect(labels[2]?.corrected).toBe(false)
  })

  it('keeps line numbers aligned when a line is unreadable', () => {
    const labels = parseLabels('01 Mar 2017 01:25\ngarbage\n03 Mar 2017 02:00\n')
    expect(labels).toHaveLength(3)
    expect(labels[1]).toBeNull()
    expect(labels[2]?.day).toBe(3)
  })

  it('looks up the label for a video time at the source frame rate', () => {
    const labels = parseLabels(FILE)
    expect(labelAt(labels, 0, 60)?.month).toBe(2)
    expect(labelAt(labels, 1 / 60, 60)?.month).toBe(3)
    expect(labelAt(labels, 2.5 / 60, 60)?.year).toBe(2022)
    // Past the end and before the start are clamped.
    expect(labelAt(labels, 999, 60)?.year).toBe(2003)
    expect(labelAt(labels, -5, 60)?.day).toBe(1)
    expect(labelAt([], 1, 60)).toBeNull()
  })

  it('formats dates for display and for speech', () => {
    const [label] = parseLabels(FILE)
    expect(formatDate(label!)).toBe('1 Mar 2017')
    expect(formatMonthYear(label!)).toBe('March 2017')
  })

  it('announces a new month only after the minimum gap', () => {
    expect(shouldAnnounceMonth('March 2017', null, Infinity, 4)).toBe(true)
    expect(shouldAnnounceMonth('March 2017', 'March 2017', 60, 4)).toBe(false)
    expect(shouldAnnounceMonth('April 2017', 'March 2017', 1.5, 4)).toBe(false)
    expect(shouldAnnounceMonth('April 2017', 'March 2017', 4, 4)).toBe(true)
  })
})
