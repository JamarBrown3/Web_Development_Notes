// stats.js: descriptive statistics for dashboards. Plain JavaScript, no React,
// no libraries, so it works in React, Node, or a plain <script>.
// Every function takes an array of numbers. Missing values (null, "", "NA", NaN)
// are removed first by cleanNumbers.
//
// Matches R's defaults: sd() and var() divide by n - 1, quantile() uses type 7.

// ---------- Cleaning ----------

// [3, "4", null, "NA", NaN, 5]  ->  [3, 4, 5]
export function cleanNumbers(values) {
  return values
    .filter((value) => value !== null && value !== "" && value !== "NA")
    .map(Number)
    .filter(Number.isFinite);
}

// Sorted copy, smallest first (never changes the original array).
function sorted(values) {
  return [...values].sort((a, b) => a - b);
}

// ---------- Center ----------

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  return quantile(values, 0.5);
}

// ---------- Spread ----------

// sample: true divides by n - 1 (what R, Excel STDEV.S and pandas use).
// sample: false divides by n (Excel STDEV.P), for when you have every value there is.
export function variance(values, { sample = true } = {}) {
  const m = mean(values);
  const squares = values.reduce((sum, value) => sum + (value - m) ** 2, 0);
  return squares / (values.length - (sample ? 1 : 0));
}

export function standardDeviation(values, options) {
  return Math.sqrt(variance(values, options));
}

// p between 0 and 1. quantile(x, 0.25) is Q1, quantile(x, 0.75) is Q3.
// Type 7 (Hyndman and Fan): the default in R, NumPy, pandas and Excel QUARTILE.INC.
export function quantile(values, p) {
  const s = sorted(values);
  const position = (s.length - 1) * p;   // where p falls between the sorted values
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const weight = position - below;       // how far past "below" it sits
  return s[below] + (s[above] - s[below]) * weight;
}

// The middle 50% of the data: Q3 - Q1. Not pulled around by extreme values.
export function iqr(values) {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

// The full spread: biggest minus smallest. One extreme value changes it a lot.
export function range(values) {
  return Math.max(...values) - Math.min(...values);
}

// ---------- Shape ----------

// Sample skewness (the adjusted Fisher-Pearson version, same as Excel SKEW).
// About 0 = symmetric. Positive = long tail to the right. Negative = long tail to the left.
export function skewness(values) {
  const n = values.length;
  const m = mean(values);
  const sd = standardDeviation(values);
  const cubes = values.reduce((sum, value) => sum + ((value - m) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * cubes;
}

// How many standard deviations a value is from the mean.
export function zScore(value, m, sd) {
  return (value - m) / sd;
}

// ---------- Outliers (Tukey's fences, the rule box plots use) ----------

export function outlierFences(values, k = 1.5) {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const spread = q3 - q1;
  return { low: q1 - k * spread, high: q3 + k * spread };
}

export function outliers(values, k = 1.5) {
  const { low, high } = outlierFences(values, k);
  return values.filter((value) => value < low || value > high);
}

// ---------- Everything at once ----------

export function describe(rawValues) {
  const values = cleanNumbers(rawValues);
  const fences = outlierFences(values);
  return {
    count: values.length,
    missing: rawValues.length - values.length,
    mean: mean(values),
    median: median(values),
    sd: standardDeviation(values),
    min: Math.min(...values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    max: Math.max(...values),
    iqr: iqr(values),
    range: range(values),
    skewness: skewness(values),
    fences,
    outliers: values.filter((value) => value < fences.low || value > fences.high),
  };
}

// ---------- Histogram and normal curve ----------

// Bin width from the Freedman-Diaconis rule: 2 * IQR / cube root of n.
// It uses the IQR, so a few extreme values don't wreck the bins.
// Falls back to Sturges' rule if the IQR is 0 (lots of identical values).
export function binCount(values) {
  const n = values.length;
  const width = (2 * iqr(values)) / Math.cbrt(n);
  const spread = range(values);
  if (width <= 0 || spread === 0) return Math.max(1, Math.ceil(Math.log2(n) + 1));
  return Math.min(60, Math.max(5, Math.ceil(spread / width)));
}

// Splits the values into equal-width bins.
// Returns [{ start, end, mid, count }, ...]
export function histogram(values, bins = binCount(values)) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const result = Array.from({ length: bins }, (_, i) => ({
    start: min + i * width,
    end: min + (i + 1) * width,
    mid: min + (i + 0.5) * width,
    count: 0,
  }));
  values.forEach((value) => {
    // The max value belongs in the last bin, not one past it.
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    result[index].count += 1;
  });
  return result;
}

// Height of the normal (bell) curve at x.
export function normalPdf(x, m, sd) {
  return Math.exp(-0.5 * ((x - m) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}
