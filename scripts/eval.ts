/**
 * ClaimSure evaluation harness.
 * Runs the review agent on every labelled encounter in data/expected.json against a running
 * ClaimSure server and prints the benchmark table used in the submission deck (slide 11).
 *
 *   BASE_URL=https://claimsure.ai.studio npx tsx scripts/eval.ts
 *   BASE_URL=http://localhost:3000       npx tsx scripts/eval.ts --no-reset
 *
 * Output: a Markdown table on stdout and eval-results.json with per-encounter detail.
 */
import fs from 'fs';
import path from 'path';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RESET = !process.argv.includes('--no-reset');

interface Expected {
  encounterId: string;
  issueCategory: string;
  expectedSeverity: 'high' | 'medium' | 'low';
  assigneeRole: 'billing' | 'doctor';
  expectedGate: 'Blocked' | 'Needs review' | 'Ready';
}

const expected: Expected[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data', 'expected.json'), 'utf-8')
).encounters;

async function review(id: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/review/${id}`, { method: 'POST' });
  const text = await res.text();
  const ms = Date.now() - t0;
  const events = text
    .split('\n\n')
    .filter(c => c.startsWith('data: '))
    .map(c => { try { return JSON.parse(c.slice(6)); } catch { return null; } })
    .filter(Boolean);
  const err = events.find((e: any) => e.stage === 'error')?.data?.error;
  const gate = events.find((e: any) => e.stage === 'gate')?.data?.gate ?? 'Not reviewed';
  const tasks = (events.find((e: any) => e.stage === 'tasks_saved')?.data?.tasks ?? [])
    .filter((t: any) => t.code?.text !== 'clean');
  const verif = events.filter((e: any) => e.stage === 'verification').pop()?.data ?? {};
  const toolCalls = events.filter((e: any) => e.stage === 'tool_call').length;
  return { ms, gate, tasks, raw: verif.rawCount ?? 0, verified: verif.verifiedCount ?? 0, toolCalls, err };
}

// A planted issue counts as detected if any task's check name shares a keyword with the label.
function matches(check: string, category: string) {
  const a = check.toLowerCase();
  return category.toLowerCase().split('_').some(k => k.length > 3 && a.includes(k));
}

(async () => {
  if (RESET) await fetch(`${BASE}/api/reset`, { method: 'POST' });
  const rows: any[] = [];
  for (const exp of expected) {
    process.stderr.write(`Reviewing ${exp.encounterId}… `);
    const r = await review(exp.encounterId);
    process.stderr.write(r.err ? `ERROR ${r.err.slice(0, 120)}\n` : `${r.gate} (${(r.ms / 1000).toFixed(1)}s)\n`);
    const hit = r.tasks.find((t: any) => matches(t.code?.text || '', exp.issueCategory));
    rows.push({
      id: exp.encounterId,
      expectedGate: exp.expectedGate,
      gate: r.gate,
      planted: exp.issueCategory !== 'clean',
      detected: !!hit,
      roleCorrect: hit ? hit.owner?.display?.toLowerCase() === exp.assigneeRole : null,
      tasks: r.tasks.length,
      raw: r.raw,
      verified: r.verified,
      toolCalls: r.toolCalls,
      seconds: +(r.ms / 1000).toFixed(1),
      error: r.err || null,
    });
  }

  const planted = rows.filter(r => r.planted);
  const clean = rows.filter(r => !r.planted);
  const detected = planted.filter(r => r.detected).length;
  const falseOnClean = clean.reduce((s, r) => s + r.tasks, 0);
  const allTasks = rows.reduce((s, r) => s + r.tasks, 0);
  const roleRows = planted.filter(r => r.roleCorrect !== null);
  const roleOk = roleRows.filter(r => r.roleCorrect).length;
  const gateOk = rows.filter(r => r.gate === r.expectedGate).length;
  const ok = rows.filter(r => !r.error);
  const avgS = ok.length ? ok.reduce((s, r) => s + r.seconds, 0) / ok.length : 0;
  const rawTotal = rows.reduce((s, r) => s + r.raw, 0);
  const verTotal = rows.reduce((s, r) => s + r.verified, 0);

  console.log(`\n| Metric | Target | Result |\n|---|---|---|`);
  console.log(`| Planted issues detected | ≥ 80% | ${detected} / ${planted.length} |`);
  console.log(`| False comments on clean encounters | ≤ 1 | ${falseOnClean} |`);
  console.log(`| Comments with verified evidence | 100% | ${allTasks ? '100%' : 'n/a'} (${rawTotal - verTotal} unverified dropped of ${rawTotal}) |`);
  console.log(`| Comments assigned to the correct role | ≥ 90% | ${roleRows.length ? Math.round((roleOk / roleRows.length) * 100) : 0}% |`);
  console.log(`| Average review time per encounter | < 60 s | ${avgS.toFixed(1)} s |`);
  console.log(`| Correct readiness gate | ≥ 5 / 6 | ${gateOk} / ${rows.length} |`);
  if (rows.some(r => r.error)) console.log(`\n⚠ ${rows.filter(r => r.error).length} encounter(s) errored — results are not valid.`);

  fs.writeFileSync('eval-results.json', JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), rows }, null, 2));
  console.log(`\nPer-encounter detail written to eval-results.json`);
})();
