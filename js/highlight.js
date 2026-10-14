// Turns findings into display pieces. Pure, so it can be tested in Node.

const sameSpans = (a, b) => a.length === b.length && a.every(x => b.includes(x));

export function segments(text, spans) {
  const cuts = new Set([0, text.length]);
  for (const s of spans) { cuts.add(Math.max(0, s.start)); cuts.add(Math.min(text.length, s.end)); }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    if (start === end) continue;
    const covering = spans.filter(s => s.start < end && s.end > start);
    const prev = out.at(-1);
    if (prev && sameSpans(prev.spans, covering)) { prev.end = end; prev.text = text.slice(prev.start, end); continue; }
    out.push({ text: text.slice(start, end), start, end, spans: covering });
  }
  return out;
}

// Sentences end at . ! ? (kept) or a newline; the last one may have no terminator.
export function flaggedSentences(text, findings) {
  const sentences = [...text.matchAll(/[^.!?\n]+(?:[.!?]+|\n|$)/g)].map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  return sentences
    .map(s => ({ ...s, findings: findings.filter(f => f.start < s.end && f.end > s.start) }))
    .filter(s => s.findings.length);
}
