/** One vinyl record: grooves, a sheen, and a label in the track's legend colours. */
export function Disc({ colors, number }: { colors: string[]; number: number }) {
  const slice = 360 / colors.length
  const arc = (i: number) => {
    const a0 = ((i * slice - 90) * Math.PI) / 180
    const a1 = (((i + 1) * slice - 90) * Math.PI) / 180
    const r = 17
    const large = slice > 180 ? 1 : 0
    return `M50 50 L${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)} Z`
  }
  const grooves = Array.from({ length: 13 }, (_, i) => 21 + i * 2)
  return (
    <svg viewBox="0 0 100 100" className="disc-svg" aria-hidden="true">
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#1d1f25" stroke="#fff" strokeOpacity={0.22} strokeWidth={0.8} />
      {grooves.map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#fff" strokeOpacity={0.09} strokeWidth={0.6} />
      ))}
      <circle cx="50" cy="50" r="48" fill="url(#sheen)" />
      {colors.length === 1 ? (
        <circle cx="50" cy="50" r="17" fill={colors[0]} />
      ) : (
        colors.map((c, i) => <path key={c} d={arc(i)} fill={c} />)
      )}
      <circle cx="50" cy="50" r="10" fill="#0b0b0e" fillOpacity={0.55} />
      <text x="50" y="53.5" textAnchor="middle" className="disc-number">
        {String(number).padStart(2, '0')}
      </text>
      <circle cx="50" cy="50" r="1.4" fill="#0b0b0e" />
    </svg>
  )
}
