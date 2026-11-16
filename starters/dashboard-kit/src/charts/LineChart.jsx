import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { longDate, niceTicks, shortDate } from "./scale.js";

export default function LineChart({
  dates,
  series,
  formatValue,
  formatTick = formatValue,
  label,
}) {
  if (!dates.length || !series.length) {
    return <p>No data for this period.</p>;
  }

  // Recharts wants one row per day, with a property for each line.
  const rows = dates.map((_, index) => {
    const row = { day: index };

    for (const line of series) {
      row[line.key] = line.values[index];
    }
    return row;
  });

  // Clean axis steps ($0, $1K, $2K...) instead of whatever Recharts picks.
  // niceTicks is the same helper the old hand-made chart used.
  const highest = Math.max(1, ...series.flatMap((line) => line.values));
  const ticks = niceTicks(0, highest, 4);

  return (
    <RechartsLineChart
      responsive
      accessibilityLayer
      title={label}
      desc="Use the left and right arrow keys to explore each day."
      data={rows}
      style={{ width: "100%", height: 280 }}
      margin={{ top: 12, right: 24, bottom: 4, left: 0 }}
    >
      {/* vertical grid lines are distracting, so turn them off */}
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis
        dataKey="day"
        tickFormatter={(index) => shortDate(dates[index])}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        tickMargin={8}
        minTickGap={18}
        interval="preserveStartEnd"
        axisLine={{ stroke: "var(--axis)" }}
      />
      <YAxis
        domain={[0, ticks[ticks.length - 1]]}
        ticks={ticks}
        width={60}
        tickFormatter={formatTick}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip
        wrapperClassName="no-print"
        isAnimationActive={false}
        cursor={{ stroke: "var(--text-2)" }}
        labelFormatter={(index) => {
          const date = dates[index];
          return date ? longDate(date) : "";
        }}
        formatter={(value, name) => [formatValue(value), name]}
        separator=": "
        contentStyle={{
          backgroundColor: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
        }}
        labelStyle={{ color: "var(--muted)" }}
        itemStyle={{ color: "var(--text)" }}
      />
      {/* Two or more lines (admin dashboard): a legend names each color,
          so the lines aren't told apart by color alone. */}
      {series.length > 1 && (
        <Legend
          verticalAlign="top"
          formatter={(name) => <span style={{ color: "var(--text-2)" }}>{name}</span>}
        />
      )}
      {series.map((line) => (
        <Line
          key={line.key}
          dataKey={line.key}
          name={line.name}
          type="linear"
          stroke={line.color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      ))}
    </RechartsLineChart>
  );
}
