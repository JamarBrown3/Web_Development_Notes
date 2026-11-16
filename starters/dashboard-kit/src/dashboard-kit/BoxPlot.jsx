// BoxPlot.jsx: a horizontal box plot in plain SVG (no library needed).
//   box      = Q1 to Q3, the middle 50% (its width is the IQR)
//   line     = the median
//   whiskers = the smallest and largest values that are NOT outliers
//   dots     = outliers (beyond 1.5 x IQR past the box: Tukey's rule)
//   diamond  = the mean
//
// Use it:  <BoxPlot values={orderTotals} unit="$" />
import { cleanNumbers, describe } from "./stats.js";

export default function BoxPlot({ values, unit = "", decimals = 0, color = "#3987e5" }) {
  const data = cleanNumbers(values);
  if (data.length < 3) return null;
  const s = describe(data);

  // Whiskers stop at the last real value inside the fences.
  const inside = data.filter((v) => v >= s.fences.low && v <= s.fences.high);
  const whiskerLow = Math.min(...inside);
  const whiskerHigh = Math.max(...inside);

  // The SVG is 1000 units wide and stretches to fit its box (viewBox),
  // so it works at any screen size and on paper.
  const W = 1000;
  const pad = 40;
  const x = (v) => pad + ((v - s.min) / (s.max - s.min || 1)) * (W - pad * 2);
  const format = (n) => `${unit}${n.toLocaleString("en-US", { maximumFractionDigits: decimals })}`;

  return (
    <figure className="print-keep" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} 130`} width="100%" role="img" aria-label={`Box plot. Median ${format(s.median)}, middle 50% from ${format(s.q1)} to ${format(s.q3)}.`}>
        {/* whisker line */}
        <line x1={x(whiskerLow)} x2={x(whiskerHigh)} y1="50" y2="50" stroke="#6b7280" strokeWidth="2" />
        <line x1={x(whiskerLow)} x2={x(whiskerLow)} y1="35" y2="65" stroke="#6b7280" strokeWidth="2" />
        <line x1={x(whiskerHigh)} x2={x(whiskerHigh)} y1="35" y2="65" stroke="#6b7280" strokeWidth="2" />

        {/* the box: Q1 to Q3 */}
        <rect x={x(s.q1)} y="25" width={x(s.q3) - x(s.q1)} height="50" rx="4" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />

        {/* median line */}
        <line x1={x(s.median)} x2={x(s.median)} y1="25" y2="75" stroke="#111827" strokeWidth="3" />

        {/* mean diamond */}
        <path d={`M ${x(s.mean)} 40 l 10 10 l -10 10 l -10 -10 z`} fill="#eb6834" />

        {/* outliers */}
        {s.outliers.map((v, i) => (
          <circle key={i} cx={x(v)} cy="50" r="6" fill="none" stroke="#111827" strokeWidth="2" />
        ))}

        {/* labels under the plot */}
        <text x={x(s.q1)} y="100" textAnchor="middle" fontSize="20" fill="#374151">Q1 {format(s.q1)}</text>
        <text x={x(s.q3)} y="100" textAnchor="middle" fontSize="20" fill="#374151">Q3 {format(s.q3)}</text>
        <text x={x(s.min)} y="125" textAnchor="start" fontSize="18" fill="#6b7280">Min {format(s.min)}</text>
        <text x={x(s.max)} y="125" textAnchor="end" fontSize="18" fill="#6b7280">Max {format(s.max)}</text>
      </svg>
    </figure>
  );
}
