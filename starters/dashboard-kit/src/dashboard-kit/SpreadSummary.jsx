// SpreadSummary.jsx: the key numbers as a table, plus one plain-English sentence.
// Prints well (tables never get cut in half thanks to print.css).
//
// Use it:  <SpreadSummary values={orderTotals} unit="$" decimals={2} />
import { cleanNumbers, describe } from "./stats.js";

export default function SpreadSummary({ values, unit = "", decimals = 0 }) {
  const data = cleanNumbers(values);
  if (data.length < 3) return null;
  const s = describe(data);
  const f = (n) => `${unit}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

  const rows = [
    ["Count", s.count.toLocaleString("en-US") + (s.missing ? ` (${s.missing} missing left out)` : "")],
    ["Mean (average)", f(s.mean)],
    ["Median (middle value)", f(s.median)],
    ["Standard deviation", f(s.sd)],
    ["IQR (middle 50%)", `${f(s.iqr)}  (${f(s.q1)} to ${f(s.q3)})`],
    ["Range (all values)", `${f(s.range)}  (${f(s.min)} to ${f(s.max)})`],
    ["Skewness", s.skewness.toFixed(2)],
    ["Outliers (Tukey 1.5 x IQR)", s.outliers.length.toString()],
  ];

  return (
    <div className="print-keep">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th scope="row" style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>{name}</th>
              <td style={{ textAlign: "right", padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 14 }}>{explainSpread(s, f)}</p>
    </div>
  );
}

// One sentence a business owner can read. No AI: the numbers pick the words.
export function explainSpread(s, f) {
  let shape;
  if (Math.abs(s.skewness) < 0.5) shape = "The values are fairly balanced around the middle";
  else if (s.skewness > 0) shape = `A few large values pull the average (${f(s.mean)}) above the typical value (${f(s.median)})`;
  else shape = `A few small values pull the average (${f(s.mean)}) below the typical value (${f(s.median)})`;
  const middle = `half of all values fall between ${f(s.q1)} and ${f(s.q3)}`;
  const extra = s.outliers.length ? `, and ${s.outliers.length} unusual value${s.outliers.length === 1 ? "" : "s"} stand${s.outliers.length === 1 ? "s" : ""} out` : "";
  return `${shape}; ${middle}${extra}.`;
}
