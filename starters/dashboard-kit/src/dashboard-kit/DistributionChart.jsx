// DistributionChart.jsx: histogram + normal (bell) curve, with the mean, the median,
// +/- 1 standard deviation and the IQR (middle 50%) marked. Built with Recharts 3.3+.
//
// Use it:  <DistributionChart values={orderTotals} unit="$" label="Order total" />
//
// How it lines up: the bars use a hidden category axis (one slot per bin) and the
// curve and markers use a number axis with the same start and end. With no padding,
// slot i covers exactly the same stretch of the chart as bin i, so they match.
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cleanNumbers, describe, histogram, normalPdf } from "./stats.js";

const COLORS = {
  bars: "#3987e5",    // blue
  curve: "#eb6834",   // orange
  mean: "#111827",    // near black, solid line
  median: "#6b7280",  // gray, dashed line
  band: "#9ca3af",    // gray shading
};

export default function DistributionChart({ values, label = "Value", unit = "", decimals = 0, height = 320 }) {
  const data = cleanNumbers(values);
  if (data.length < 3) return <p>Not enough data to show a distribution (need at least 3 values).</p>;

  const s = describe(data);
  const bins = histogram(data);
  const binWidth = bins[0].end - bins[0].start;
  const start = bins[0].start;
  const end = bins[bins.length - 1].end;

  // Bell curve sampled at 100 points across the same range as the bars.
  // normalPdf * count * binWidth = "how many values we'd expect in a bin here".
  const curve = Array.from({ length: 100 }, (_, i) => {
    const x = start + ((end - start) * i) / 99;
    return { x, expected: normalPdf(x, s.mean, s.sd) * data.length * binWidth };
  });

  // Round tick values for the bottom axis, like 0, 10, 20, 30.
  const ticks = niceTicks(start, end);

  const format = (n) => `${unit}${n.toLocaleString("en-US", { maximumFractionDigits: decimals })}`;
  const bars = bins.map((bin, i) => ({ ...bin, slot: i, label: `${format(bin.start)} to ${format(bin.end)}` }));

  return (
    <figure className="distribution print-keep" style={{ margin: 0 }}>
      <ComposedChart
        style={{ width: "100%", height }}
        responsive
        data={bars}
        margin={{ top: 12, right: 24, bottom: 28, left: 8 }}
        barCategoryGap={1}
      >
        <CartesianGrid vertical={false} stroke="#e5e7eb" />

        {/* Hidden slot axis for the bars. */}
        <XAxis xAxisId="bins" dataKey="slot" type="category" hide padding={{ left: 0, right: 0 }} />

        {/* Visible number axis for the curve, the markers and the tick labels. */}
        <XAxis
          xAxisId="num"
          type="number"
          dataKey="x"
          domain={[start, end]}
          allowDataOverflow
          tickFormatter={format}
          ticks={ticks}
          height={30}
          stroke="#9ca3af"
        />
        <YAxis allowDecimals={false} stroke="#9ca3af" width={44} label={{ value: "Count", angle: -90, position: "insideLeft" }} />

        {/* Shaded bands: middle 50% (IQR), then mean +/- 1 SD as a lighter band. */}
        <ReferenceArea xAxisId="num" x1={Math.max(start, s.mean - s.sd)} x2={Math.min(end, s.mean + s.sd)} fill={COLORS.band} fillOpacity={0.12} />
        <ReferenceArea xAxisId="num" x1={s.q1} x2={s.q3} fill={COLORS.band} fillOpacity={0.22} />

        <Bar xAxisId="bins" dataKey="count" name="Count" fill={COLORS.bars} radius={[3, 3, 0, 0]} isAnimationActive={false} />

        <Line
          xAxisId="num"
          data={curve}
          dataKey="expected"
          name="Normal curve"
          type="monotone"
          stroke={COLORS.curve}
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />

                {/* Mean = solid line, median = dashed line. Their values are in the key below,
            because labels on the lines collide when the two are close together. */}
        <ReferenceLine xAxisId="num" x={s.mean} stroke={COLORS.mean} strokeWidth={2} />
        <ReferenceLine xAxisId="num" x={s.median} stroke={COLORS.median} strokeWidth={2} strokeDasharray="5 4" />

        <Tooltip content={<BinTooltip total={data.length} />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
      </ComposedChart>

      {/* Key: every mark explained in words, so nothing depends on color alone. */}
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13, color: "#374151" }}>
        <span><Swatch color={COLORS.bars} /> {label} counts</span>
        <span><Swatch color={COLORS.curve} line /> Normal curve (same mean and SD)</span>
        <span><Swatch color={COLORS.mean} line /> Mean {format(s.mean)}</span>
        <span><Swatch color={COLORS.median} line dashed /> Median {format(s.median)}</span>
        <span><Swatch color={COLORS.band} faded={0.45} /> Middle 50% (IQR) {format(s.q1)} to {format(s.q3)}</span>
        <span><Swatch color={COLORS.band} faded={0.2} /> Within 1 SD ({format(s.sd)}) of the mean</span>
      </figcaption>
    </figure>
  );
}

// Small color key used in the caption.
function Swatch({ color, line = false, dashed = false, faded = 1 }) {
  const style = line
    ? { display: "inline-block", width: 18, height: 0, borderTop: `${dashed ? "2px dashed" : "3px solid"} ${color}`, verticalAlign: "middle" }
    : { display: "inline-block", width: 12, height: 12, borderRadius: 2, background: color, opacity: faded, verticalAlign: "middle" };
  return <span aria-hidden="true" style={style} />;
}

// Hover box for one bar: the range, the count, and its share of all values.
function BinTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const bin = payload.find((item) => item.dataKey === "count")?.payload;
  if (!bin) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
      <strong>{bin.count} values</strong> ({Math.round((bin.count / total) * 100)}%)
      <div style={{ color: "#4b5563" }}>{bin.label}</div>
    </div>
  );
}

// Picks about 6 round numbers between start and end (steps of 1, 2, 2.5 or 5 x 10^n).
function niceTicks(start, end, count = 6) {
  const rough = (end - start) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((m) => m >= rough);
  const first = Math.ceil(start / step) * step;
  const ticks = [];
  for (let t = first; t <= end + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}
