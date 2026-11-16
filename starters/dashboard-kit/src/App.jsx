// Demo dashboard: puts every piece of the kit on one page.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PrintButton from "./dashboard-kit/PrintButton.jsx";
import DistributionChart from "./dashboard-kit/DistributionChart.jsx";
import BoxPlot from "./dashboard-kit/BoxPlot.jsx";
import SpreadSummary from "./dashboard-kit/SpreadSummary.jsx";
import { orderTotals, dailySales } from "./sampleData.js";

export default function App() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Corner Coffee: October</h1>
        <PrintButton fileName="Corner Coffee - October report" />
      </header>
      <p className="print-only">Printed {new Date().toLocaleDateString("en-US", { dateStyle: "long" })}</p>

      <section className="print-keep">
        <h2>Daily sales (ResponsiveContainer)</h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailySales} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line dataKey="sales" stroke="#3987e5" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="print-keep">
        <h2>How big is a typical order?</h2>
        <DistributionChart values={orderTotals} label="Order total" unit="$" />
        <BoxPlot values={orderTotals} unit="$" />
        <SpreadSummary values={orderTotals} unit="$" decimals={2} />
      </section>
    </main>
  );
}
