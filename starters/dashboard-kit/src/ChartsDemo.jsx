// Demo page for the charts folder: the What happened box, one line chart and two bar charts.
// To see it, change the import in main.jsx to:  import App from "./ChartsDemo.jsx";
import ChartCard from "./charts/ChartCard.jsx";
import LineChart from "./charts/LineChart.jsx";
import BarChart from "./charts/BarChart.jsx";
import WhatHappened from "./charts/WhatHappened.jsx";
import { fullNumber, longDate, money } from "./charts/scale.js";
import "./charts/charts.css";
import "./charts/what-happened.css";

// Fake data. In a real project this comes from your API.
const days = Array.from({ length: 30 }, (_, index) => ({
  date: new Date(2026, 9, index + 1),
  revenue: Math.round(900 + 450 * Math.sin(index / 3) + index * 22),
  orders: Math.round(40 + 14 * Math.sin(index / 3) + index),
}));

const categories = [
  { label: "Coffee", value: 18400 },
  { label: "Pastries", value: 9200 },
  { label: "Sandwiches", value: 7600 },
  { label: "Merch", value: 2100 },
];

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => ({
  label,
  value: [1180, 1240, 1310, 1290, 1620, 1890, 1450][index],
}));

export default function ChartsDemo() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Corner Coffee: October</h1>

      <WhatHappened
        sentences={[
          "Sales were $11,930 this week, about 2% more than last week, from 1,423 orders.",
          "Saturday was your best day of the month at $2,179.",
          "Cold drinks fell to 9% of sales while espresso drinks grew to 41%.",
        ]}
        note="Updated each morning from yesterday's sales."
      />

      <div className="chart-grid">
        <ChartCard
          className="chart-card--wide"
          title="Daily sales"
          subtitle="Each day's sales and orders"
          columns={["Day", "Sales", "Orders"]}
          rows={days.map((day) => [longDate(day.date), money(day.revenue), fullNumber(day.orders)])}
        >
          <LineChart
            label="Daily sales for Corner Coffee"
            dates={days.map((day) => day.date)}
            series={[
              { key: "sales", name: "Sales", color: "var(--series-1)", values: days.map((day) => day.revenue) },
            ]}
            formatValue={(value) => money(value)}
            formatTick={(value) => money(value, { compact: true })}
          />
        </ChartCard>

        <ChartCard
          title="Sales by category"
          subtitle="Where the money came from"
          columns={["Category", "Sales"]}
          rows={categories.map((item) => [item.label, money(item.value)])}
        >
          <BarChart label="Sales by category" items={categories} formatValue={(value) => money(value)} />
        </ChartCard>

        <ChartCard
          title="Average day of the week"
          subtitle="Average sales for each weekday"
          columns={["Day", "Sales"]}
          rows={weekdays.map((item) => [item.label, money(item.value)])}
        >
          <BarChart
            label="Sales by day of the week"
            items={weekdays}
            formatValue={(value) => money(value)}
            showShare={false}
          />
        </ChartCard>
      </div>
    </main>
  );
}
