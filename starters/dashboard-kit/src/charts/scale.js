// Math and formatting shared by the charts.

// Round axis ticks: niceTicks(0, 1834, 4) -> [0, 500, 1000, 1500, 2000]
export function niceTicks(min, max, count = 4) {
  if (max <= min) return [min, min + 1];
  const rough = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let value = start; value < max + step * 0.999; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

// 1,284 / 12.9K / 4.2M
export function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function fullNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function money(value, { compact = false, cents = false } = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : cents ? 2 : 0,
    minimumFractionDigits: cents && !compact ? 2 : 0,
  }).format(value);
}

export function shortDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
