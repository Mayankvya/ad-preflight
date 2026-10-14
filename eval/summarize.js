// "Caught" = the checker said Risky or Likely rejected for an ad Meta rejected.
// "False alarm" = it said Likely rejected for an ad Meta approved.
export function summarize(rows) {
  const rej = rows.filter(r => r.outcome === 'rejected');
  const app = rows.filter(r => r.outcome === 'approved');
  return {
    rejected: { total: rej.length, caught: rej.filter(r => r.verdict !== 'fine').length, missed: rej.filter(r => r.verdict === 'fine').map(r => r.id) },
    approved: {
      total: app.length,
      flaggedRejected: app.filter(r => r.verdict === 'rejected').length,
      flaggedRisky: app.filter(r => r.verdict === 'risky').length,
      falseAlarms: app.filter(r => r.verdict === 'rejected').map(r => r.id),
    },
  };
}
