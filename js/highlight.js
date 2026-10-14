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

// Sentences end at . ! ? followed by a space or the end (kept), or at a newline,
// so "2.5 kg" and "f*!%ing" stay whole. The last one may have no terminator.
const SENTENCE = /(?:[^.!?\n]|[.!?]+(?![\s]|$))+(?:[.!?]+(?=\s|$)|\n|$)/g;

export function flaggedSentences(text, findings) {
  const sentences = [...text.matchAll(SENTENCE)].map(m => ({ start: m.index, end: m.index + m[0].length }));
  // A finding that crosses a sentence break joins those sentences into one card.
  const merged = [];
  for (const s of sentences) {
    const prev = merged.at(-1);
    if (prev && findings.some(f => f.start < prev.end && f.end > s.start)) prev.end = s.end;
    else merged.push({ ...s });
  }
  return merged
    .map(s => {
      const raw = text.slice(s.start, s.end);
      const end = s.start + raw.replace(/\s+$/, '').length; // a trailing newline is not part of the card
      return { start: s.start, end, text: text.slice(s.start, end), findings: findings.filter(f => f.start < s.end && f.end > s.start) };
    })
    .filter(s => s.findings.length);
}
