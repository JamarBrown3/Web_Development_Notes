# Dashboard kit (starter)

Tested 4 Nov 2026 with React 19.2, Recharts 3.10.1 and Vite 7.

    npm install
    npm run dev

- `src/dashboard-kit/` holds the pieces to copy into any dashboard:
  PrintButton.jsx, print.css, stats.js, DistributionChart.jsx, BoxPlot.jsx, SpreadSummary.jsx
- `src/App.jsx` is a demo page that uses all of them with the fake data in `src/sampleData.js`.
- Explanations are on dashboard_page.html in Web_Development_Notes.
- `src/charts/` holds the line chart and bar chart from REV (Recharts): scale.js, LineChart.jsx,
  BarChart.jsx, ChartCard.jsx and charts.css, plus WhatHappened.jsx and what-happened.css
  (the box of plain-English sentences). `src/ChartsDemo.jsx` is a demo page for them.
  To see it, change the import in `src/main.jsx` to `./ChartsDemo.jsx`. Added 12 Nov 2026.
