import {
  Bar,
  BarChart as RechartsBarChart,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function BarChart({
  items,
  formatValue,
  color = "var(--series-1)",
  label,
  showShare = true,
}) {
  if (!items.length) {
    return <p>No data for this period.</p>;
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const average = total / items.length;
  const highest = Math.max(...items.map((item) => item.value));
  const lowest = Math.min(...items.map((item) => item.value));

  const rows = items.map((item) => {
    const share = total ? Math.round((item.value / total) * 100) : 0;
    const difference = average
      ? Math.round(((item.value - average) / average) * 100)
      : 0;

    let comparison = "About the average";
    if (difference > 0) comparison = `${difference}% above the average`;
    if (difference < 0)
      comparison = `${Math.abs(difference)}% below the average`;

    let rank = "";

    if (highest !== lowest && item.value === highest) {
      rank = "Highest. ";
    }
    if (highest !== lowest && item.value === lowest) {
      rank = "Lowest. ";
    }

    return {
      ...item,
      detail: showShare ? `${share}% of the total` : `${rank}${comparison}`,
    };
  });

  return (
    <RechartsBarChart
      responsive
      accessibilityLayer
      title={label}
      desc="Use the left and right arrow keys to explore the bars."
      layout="vertical"
      data={rows}
      style={{ width: "100%", height: rows.length * 36 + 16 }}
      margin={{ top: 8, right: 72, bottom: 8, left: 0 }}
    >
      <XAxis type="number" domain={[0, "auto"]} hide />

      <YAxis
        type="category"
        dataKey="label"
        width={112}
        tick={{ fill: "var(--text-2)", fontSize: 12 }}
        tickLine={false}
        axisLine={{ stroke: "var(--axis)" }}
      />

      <Tooltip
        wrapperClassName="no-print"
        isAnimationActive={false}
        cursor={{ fill: "var(--surface-2)" }}
        content={({ active, payload }) => {
          const item = payload?.[0]?.payload;
          if (!active || !item) return null;

          return (
            <div
              className="chart-tooltip"
              style={{ position: "static" }}
              role="status"
              aria-atomic="true"
            >
              <p className="chart-tooltip__date">{item.label}</p>
              <p>
                <strong>{formatValue(item.value)}</strong>
              </p>
              <p>{item.detail}</p>
            </div>
          );
        }}
      />

      <Bar
        dataKey="value"
        fill={color}
        barSize={20}
        radius={[0, 4, 4, 0]}
        isAnimationActive={false}
      >
        <LabelList
          dataKey="value"
          position="right"
          offset={8}
          formatter={formatValue}
          fill="var(--text)"
          fontSize={12}
          fontWeight={700}
        />
      </Bar>
    </RechartsBarChart>
  );
}
