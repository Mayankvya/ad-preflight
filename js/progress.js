// Transformers.js reports progress per file, and only learns a file's size
// when it starts fetching it. Summing only the files seen so far makes the
// bar hit 100% after the first tiny config file, so we never let the total
// drop below what we know the whole download weighs.

export const EXPECTED_BYTES = 785e6;

export function createProgress(expectedTotal = EXPECTED_BYTES) {
  const files = new Map();
  const sums = () => {
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    return { loaded, total };
  };
  return {
    update(p) {
      if (p.status !== 'progress' && p.status !== 'done') return null;
      const prev = files.get(p.file) ?? { loaded: 0, total: 0 };
      const total = p.total ?? prev.total;
      files.set(p.file, { loaded: p.status === 'done' ? total : (p.loaded ?? prev.loaded), total });
      const s = sums();
      return { loaded: s.loaded, total: Math.max(s.total, expectedTotal) };
    },
    finish() {
      const { total } = sums();
      return { loaded: total, total };
    },
  };
}
