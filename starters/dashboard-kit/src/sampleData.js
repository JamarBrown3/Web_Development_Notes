// Fake data for the demo. Seeded, so it is the same every time.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(42);
// Box-Muller: two uniform numbers -> one normal number.
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

// 400 order totals, skewed right like real orders (most small, a few big).
export const orderTotals = Array.from({ length: 400 }, () => Math.round(Math.exp(2.3 + 0.35 * normal()) * 100) / 100);
orderTotals.push(48.5, 52, "NA", null); // two big catering orders + two missing values

export const dailySales = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, sales: Math.round(1400 + i * 8 + 220 * normal()) }));
