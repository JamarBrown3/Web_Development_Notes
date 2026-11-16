// A chart with a title and a "Show table" switch. The table has the same
// numbers as the chart, for screen readers, printing and anyone who prefers rows.
import { useState } from "react";

export default function ChartCard({ title, subtitle, columns, rows, children, className = "" }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`chart-card ${className}`}>
      <header className="chart-card__head">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {subtitle && <p className="chart-card__subtitle">{subtitle}</p>}
        </div>
        <button type="button" className="text-button chart-card__switch" aria-pressed={showTable} onClick={() => setShowTable((on) => !on)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </header>

      {showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {/* Printed reports always include the table under the chart. */}
      {!showTable && (
        <div className="print-only table-wrap">
          <table className="data-table">
            {rows.length > 31 && <caption>The last 31 rows of {rows.length}</caption>}
            <thead>
              <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(-31).map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
