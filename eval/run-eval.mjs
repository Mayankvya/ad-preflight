// Runs the rules over real past ads. Input: eval/private/ads.json (git-ignored),
// or a path given as the first argument. Prints counts and per-ad rule hits.
import { readFileSync } from 'node:fs';
import { checkAd } from '../js/rules.js';
import { summarize } from './summarize.js';

const path = process.argv[2] ?? new URL('./private/ads.json', import.meta.url);
const ads = JSON.parse(readFileSync(path, 'utf8'));
const rows = ads.map(ad => {
  const { verdict, findings } = checkAd(ad, ad.category ?? 'general');
  return { id: ad.id, outcome: ad.outcome, verdict, ruleIds: [...new Set(findings.map(f => f.ruleId))], reason: ad.reason ?? '' };
});
for (const r of rows) console.log(`${r.id.padEnd(8)} ${r.outcome.padEnd(9)} -> ${r.verdict.padEnd(9)} ${r.ruleIds.join(', ')}${r.reason ? `   (Meta said: ${r.reason})` : ''}`);
const s = summarize(rows);
console.log(`\nRejected ads caught: ${s.rejected.caught} of ${s.rejected.total}${s.rejected.missed.length ? ` (missed: ${s.rejected.missed.join(', ')})` : ''}`);
console.log(`Approved ads wrongly marked "Likely rejected": ${s.approved.flaggedRejected} of ${s.approved.total}; marked "Risky": ${s.approved.flaggedRisky}`);
