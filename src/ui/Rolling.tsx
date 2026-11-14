import { useEffect, useRef, useState } from 'react'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * The latest value, but changing at most once every `ms`. The deadline is fixed
 * from the last change, so a value that changes every frame still updates on time.
 */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - performance.now())
    const timer = window.setTimeout(() => {
      last.current = performance.now()
      setShown(value)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return shown
}

/**
 * Text whose digits roll to their new value instead of jumping, like a
 * mechanical counter. It changes at most every `minInterval` ms so each roll
 * finishes and stays readable. Screen readers get the plain text; the rolling
 * copy is hidden from them. With reduced motion the digits simply change.
 */
export function Rolling({ text, minInterval = 450 }: { text: string; minInterval?: number }) {
  const shown = useThrottled(text, minInterval)
  return (
    <>
      <span className="visually-hidden">{shown}</span>
      <span className="roll" aria-hidden="true">
        {[...shown].map((ch, i) =>
          ch >= '0' && ch <= '9' ? (
            <span key={i} className="roll-digit">
              <span className="roll-col" style={{ transform: `translateY(${-Number(ch)}em)` }}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i}>{ch}</span>
          ),
        )}
      </span>
    </>
  )
}
