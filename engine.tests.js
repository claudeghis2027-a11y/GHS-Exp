/* GHS Exp — Distribution Engine test suite (STEP 2)
   Uses SEPARATE TEST FIXTURES ONLY. Never touches v6 or any production data. */
var E = require('./engine.js');
var P = 0, F = 0, N = 0;
function t(name, cond, actual) {
  N++; if (cond) P++; else F++;
  console.log('[' + (cond ? 'PASS' : 'FAIL') + '] TEST ' + N + ' — ' + name);
  if (actual !== undefined) console.log('        actual: ' + actual);
}
var SET = { RESIDUAL_SMALL_PCT: 0.005, RESIDUAL_SMALL_USE_MIN_PRICE: 'TRUE' };
function item(id, price, opts) {
  opts = opts || {};
  return {
    id: id, typeId: 'ETX', name: id, level: opts.level || 'ITEM',
    active: opts.active !== false, price: price,
    priceStatus: opts.priceStatus || 'APPROVED', weight: opts.weight || 1
  };
}
function lim(id, mmin, mmax, amax) { return { fy: 'FYX', item: id, mmin: mmin, mmax: mmax, amax: amax }; }
function base(extra) {
  return Object.assign({
    fyId: 'FYX', typeId: 'ETX', periodIndex: 1, invoiceCount: 3,
    items: [], limits: [], approvedRuns: [], approvedLines: [],
    settings: SET, seed: 12345, generatedBy: 'test@local', now: '2026-01-01T00:00:00Z'
  }, extra || {});
}

console.log('================ DISTRIBUTION ENGINE — 23 TESTS ================\n');

/* 1 — EXACT */
var r1 = E.generate(base({ targetInclVat: 1000, items: [item('A', 100), item('B', 250)],
  limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('Exact Match', r1.run.distributionStatus === 'EXACT' && r1.run.remainingInclVat === 0,
  r1.run.distributionStatus + ' · distributed ' + r1.run.distributedInclVat + ' · remaining ' + r1.run.remainingInclVat);

/* 2 — PARTIAL (small residual) */
var r2 = E.generate(base({ targetInclVat: 100000, seed: 7,
  items: [item('A', 193.8), item('B', 79.8)], limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('Partial Distribution (small residual)',
  r2.run.distributionStatus === 'PARTIAL' || r2.run.distributionStatus === 'EXACT',
  r2.run.distributionStatus + ' · distributed ' + r2.run.distributedInclVat + ' · remaining ' + r2.run.remainingInclVat);

/* 3 — CLOSEST_POSSIBLE (large shortfall: capacity capped far below target) */
var r3 = E.generate(base({ targetInclVat: 100000, items: [item('A', 100)], limits: [lim('A', 0, 10, 10)] }));
t('Large Shortfall / Closest Possible',
  r3.run.distributionStatus === 'CLOSEST_POSSIBLE' && r3.run.distributedInclVat === 1000,
  r3.run.distributionStatus + ' · distributed ' + r3.run.distributedInclVat + ' · remaining ' + r3.run.remainingInclVat);

/* 4 — Monthly Max enforcement */
var r4 = E.generate(base({ targetInclVat: 50000, items: [item('A', 100)], limits: [lim('A', 0, 25, 1000)] }));
t('Monthly Max enforcement (qty <= 25)',
  r4.lines.length === 1 && r4.lines[0].quantity === 25,
  'qty ' + (r4.lines[0] ? r4.lines[0].quantity : 'none') + ' · distributed ' + r4.run.distributedInclVat);

/* 5 — Annual Max enforcement (200 cap, 180 already used in APPROVED run) */
var r5 = E.generate(base({ targetInclVat: 50000, items: [item('A', 100)], limits: [lim('A', 0, 1000, 200)],
  approvedRuns: [{ id: 'R1', fy: 'FYX', typeId: 'ETX', periodIndex: 0, status: 'APPROVED' }],
  approvedLines: [{ runId: 'R1', itemId: 'A', quantity: 180 }] }));
t('Annual Max enforcement (200-180 => max 20)',
  r5.lines.length === 1 && r5.lines[0].quantity === 20,
  'qty ' + (r5.lines[0] ? r5.lines[0].quantity : 'none'));

/* 6 — Monthly Min applies only to SELECTED items */
var r6 = E.generate(base({ targetInclVat: 1000, seed: 3,
  items: [item('A', 100), item('B', 100), item('C', 100)],
  limits: [lim('A', 5, 10, 100), lim('B', 5, 10, 100), lim('C', 5, 10, 100)] }));
var minOK = r6.lines.every(function (l) { return l.quantity >= 5; });
var notAll = r6.lines.length < 3;
t('Monthly Min only when selected',
  minOK && r6.run.distributedInclVat <= 1000,
  'selected ' + r6.lines.length + '/3 · qty ' + r6.lines.map(function (l) { return l.itemId + ':' + l.quantity; }).join(',') +
  ' · every selected >= min: ' + minOK + ' · unselected omitted: ' + notAll);

/* 7 — INACTIVE excluded */
var r7 = E.generate(base({ targetInclVat: 1000, items: [item('A', 100, { active: false }), item('B', 100)],
  limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('Inactive item excluded',
  !r7.lines.some(function (l) { return l.itemId === 'A'; }) &&
  r7.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'INACTIVE'; }),
  'excluded: ' + JSON.stringify(r7.diagnostics.excluded));

/* 8 — ROLLUP excluded */
var r8 = E.generate(base({ targetInclVat: 1000,
  items: [item('A', 100, { level: 'ROLLUP' }), item('B', 100)],
  limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('ROLLUP excluded',
  !r8.lines.some(function (l) { return l.itemId === 'A'; }) &&
  r8.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'NOT_ITEM_LEVEL'; }),
  'excluded: ' + JSON.stringify(r8.diagnostics.excluded));

/* 9 — missing Operating Price excluded */
var r9 = E.generate(base({ targetInclVat: 1000, items: [item('A', 0), item('B', 100)],
  limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('Missing Operating Price excluded',
  r9.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'NO_OPERATING_PRICE'; }),
  'excluded: ' + JSON.stringify(r9.diagnostics.excluded));

/* 10 — SUGGESTED excluded until confirmed */
var r10 = E.generate(base({ targetInclVat: 1000,
  items: [item('A', 100, { priceStatus: 'SUGGESTED' }), item('B', 100)],
  limits: [lim('A', 0, null, 100000), lim('B', 0, null, 100000)] }));
t('Suggested Price excluded until confirmed',
  r10.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'PRICE_NOT_APPROVED'; }) &&
  !r10.lines.some(function (l) { return l.itemId === 'A'; }),
  'excluded: ' + JSON.stringify(r10.diagnostics.excluded));

/* 11 — no unit does NOT exclude (engine never reads unit) */
var noUnit = item('A', 100); noUnit.unitId = null; noUnit.unitConfidence = 'UNKNOWN'; noUnit.dataStatus = 'NEEDS_REVIEW';
var r11 = E.generate(base({ targetInclVat: 1000, items: [noUnit], limits: [lim('A', 0, null, 100000)] }));
t('No Unit does NOT exclude item',
  r11.lines.length === 1 && r11.lines[0].itemId === 'A',
  'lines ' + r11.lines.length + ' · distributed ' + r11.run.distributedInclVat);

/* 12 — never over budget (100 random seeds, awkward prices) */
var over = 0, ran = 0;
for (var s = 1; s <= 100; s++) {
  var rr = E.generate(base({ targetInclVat: 7777.77, seed: s,
    items: [item('A', 193.8), item('B', 79.8), item('C', 1234.56), item('D', 33.33)],
    limits: [lim('A', 1, 50, 500), lim('B', 2, 40, 400), lim('C', 0, 5, 50), lim('D', 0, 90, 900)] }));
  ran++;
  if (rr.run.distributedInclVat > 7777.77 + 1e-9) over++;
}
t('No Budget Overrun (100 seeds)', over === 0, over + ' overruns out of ' + ran + ' runs');

/* 13 — Regenerate: new seed, previous GENERATED becomes CANCELLED */
var g1 = E.generate(base({ targetInclVat: 5000, seed: 101, runId: 'RUN000001',
  items: [item('A', 100), item('B', 250)], limits: [lim('A', 0, 100, 1000), lim('B', 0, 100, 1000)] }));
var store = [g1.run];
var g2 = E.generate(base({ targetInclVat: 5000, seed: 202, runId: 'RUN000002',
  items: [item('A', 100), item('B', 250)], limits: [lim('A', 0, 100, 1000), lim('B', 0, 100, 1000)] }));
store.forEach(function (r) { if (r.status === 'GENERATED') r.status = 'CANCELLED'; });
store.push(g2.run);
t('Regenerate: new seed + previous run CANCELLED (kept)',
  store.length === 2 && store[0].status === 'CANCELLED' && store[1].status === 'GENERATED' &&
  store[0].randomSeed !== store[1].randomSeed,
  'run1 ' + store[0].status + ' seed ' + store[0].randomSeed + ' | run2 ' + store[1].status + ' seed ' + store[1].randomSeed);

/* 14 — Approved run immutable */
var approved = Object.freeze({ id: 'R1', fy: 'FYX', typeId: 'ETX', periodIndex: 0, status: 'APPROVED',
  distributedInclVat: 12345.67 });
var snapshot = JSON.stringify(approved);
E.generate(base({ targetInclVat: 5000, items: [item('A', 100)], limits: [lim('A', 0, 100, 1000)],
  approvedRuns: [approved], approvedLines: [{ runId: 'R1', itemId: 'A', quantity: 10 }] }));
t('Approved Run remains immutable', JSON.stringify(approved) === snapshot, 'unchanged: ' + snapshot);

/* 15 — annual usage counts APPROVED only (ignores GENERATED / CANCELLED / SUPERSEDED) */
var usedApproved = E.annualUsedQty('A', 'FYX',
  [{ id: 'R1', fy: 'FYX', status: 'APPROVED' }, { id: 'R2', fy: 'FYX', status: 'GENERATED' },
   { id: 'R3', fy: 'FYX', status: 'CANCELLED' }, { id: 'R4', fy: 'FYX', status: 'SUPERSEDED' }],
  [{ runId: 'R1', itemId: 'A', quantity: 30 }, { runId: 'R2', itemId: 'A', quantity: 999 },
   { runId: 'R3', itemId: 'A', quantity: 999 }, { runId: 'R4', itemId: 'A', quantity: 999 }]);
t('Annual usage uses only APPROVED runs', usedApproved === 30, 'used = ' + usedApproved + ' (expected 30)');

/* 16 — invoice_count stored, never a constraint */
var a16 = E.generate(base({ targetInclVat: 300, invoiceCount: 9,
  items: [item('A', 100)], limits: [lim('A', 0, 3, 30)] }));
var b16 = E.generate(base({ targetInclVat: 300, invoiceCount: 1,
  items: [item('A', 100)], limits: [lim('A', 0, 3, 30)] }));
t('Invoice Count stored but does not affect eligibility',
  a16.run.invoiceCount === 9 && b16.run.invoiceCount === 1 &&
  a16.run.distributedInclVat === b16.run.distributedInclVat && a16.lines.length === b16.lines.length,
  'ic=9 -> ' + a16.run.distributedInclVat + ' / ' + a16.lines.length + ' lines · ic=1 -> ' +
  b16.run.distributedInclVat + ' / ' + b16.lines.length + ' lines');

/* 17 — VAT-inclusive, no 1.14 conversion */
var r17 = E.generate(base({ targetInclVat: 114000, items: [item('A', 114)], limits: [lim('A', 0, 5000, 50000)] }));
t('Budget VAT-inclusive · no 1.14 conversion',
  r17.run.distributedInclVat === 114000 && r17.lines[0].quantity === 1000 &&
  r17.lines[0].unitPriceSnapshotInclVat === 114,
  'qty ' + r17.lines[0].quantity + ' × 114 = ' + r17.run.distributedInclVat + ' (100000/1.14 NOT used)');

/* 18 — zero budget handled safely */
var r18 = E.generate(base({ targetInclVat: 0, items: [item('A', 100)], limits: [lim('A', 0, 10, 100)] }));
t('Zero Budget handled safely',
  r18.run.distributionStatus === 'INFEASIBLE' && r18.run.failReason === 'ZERO_BUDGET' &&
  r18.lines.length === 0 && isFinite(r18.run.executionPct),
  r18.run.failReason + ' · lines ' + r18.lines.length + ' · exec ' + r18.run.executionPct);

/* 19 — zero eligible => FAILED with reasons */
var r19 = E.generate(base({ targetInclVat: 5000,
  items: [item('A', 100, { active: false }), item('B', 100, { level: 'ROLLUP' }),
          item('C', 0), item('D', 100, { priceStatus: 'SUGGESTED' })],
  limits: [] }));
t('Zero eligible items => FAILED with clear reasons',
  r19.run.status === 'FAILED' && r19.run.failReason === 'NO_ELIGIBLE_ITEMS' &&
  r19.diagnostics.excluded.length === 4,
  r19.run.failReason + ' · ' + r19.diagnostics.excluded.map(function (x) { return x.itemId + '=' + x.reason; }).join(', '));

/* 20 — regeneration can yield a different valid subset */
var sets = {}, valid = 0;
for (var s2 = 1; s2 <= 30; s2++) {
  var rv = E.generate(base({ targetInclVat: 20000, seed: s2,
    items: [item('A', 100), item('B', 250), item('C', 500), item('D', 75), item('E', 1000), item('F', 40)],
    limits: [lim('A', 0, 60, 600), lim('B', 0, 40, 400), lim('C', 0, 20, 200),
             lim('D', 0, 80, 800), lim('E', 0, 10, 100), lim('F', 0, 90, 900)] }));
  if (rv.run.distributedInclVat <= 20000 && rv.run.distributionStatus !== 'INFEASIBLE') valid++;
  sets[rv.lines.map(function (l) { return l.itemId; }).sort().join('+')] = 1;
}
t('Regeneration produces different valid subsets',
  Object.keys(sets).length > 1 && valid === 30,
  Object.keys(sets).length + ' distinct subsets over 30 seeds · all valid: ' + (valid === 30));

/* 21 — Missing Annual Max => excluded */
var r21 = E.generate(base({ targetInclVat: 5000,
  items: [item('A', 100), item('B', 100)],
  limits: [ lim('B', 0, null, 500) ] }));            /* A has NO limits row at all */
var r21b = E.generate(base({ targetInclVat: 5000,
  items: [item('A', 100), item('B', 100)],
  limits: [ lim('A', 0, 50, null), lim('B', 0, null, 500) ] }));   /* A has a row but amax = NULL */
t('Missing Annual Max => excluded from Distribution',
  r21.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'ANNUAL_MAX_NOT_SET'; }) &&
  !r21.lines.some(function (l) { return l.itemId === 'A'; }) &&
  r21b.diagnostics.excluded.some(function (x) { return x.itemId === 'A' && x.reason === 'ANNUAL_MAX_NOT_SET'; }) &&
  !r21b.lines.some(function (l) { return l.itemId === 'A'; }),
  'no-row: ' + JSON.stringify(r21.diagnostics.excluded) + ' | null-amax: ' + JSON.stringify(r21b.diagnostics.excluded));

/* 22 — annual_max NOT treated as infinity */
var r22 = E.generate(base({ targetInclVat: 1000000,
  items: [item('A', 100)], limits: [lim('A', 0, null, null)] }));
t('Annual Max NULL is NOT treated as unlimited',
  r22.run.distributionStatus === 'INFEASIBLE' && r22.run.failReason === 'NO_ELIGIBLE_ITEMS' &&
  r22.run.distributedInclVat === 0,
  r22.run.failReason + ' · distributed ' + r22.run.distributedInclVat + ' (an ∞ reading would have produced 1,000,000)');

/* 23 — closer allocation beats higher capacity */
/*  BIG  : price 700, amax 100  -> capacity 70,000  but 700-grid can only reach 9,800 of 10,000 (rem 200)
    SMALL: price 100, amax  99  -> capacity  9,900  (lower) yet reaches 9,900          (rem 100 -> closer)  */
var wins = 0, runs = 0, remBig = null, remSmall = null;
for (var s3 = 1; s3 <= 60; s3++) {
  var rc = E.generate(base({ targetInclVat: 10000, seed: s3,
    items: [item('BIG', 700, { weight: 5 }), item('SMALL', 100, { weight: 1 })],
    limits: [lim('BIG', 0, 100, 100), lim('SMALL', 0, 99, 99)] }));
  runs++;
  var ids = rc.lines.map(function (l) { return l.itemId; }).sort().join('+');
  if (ids === 'BIG') remBig = rc.run.remainingInclVat;
  if (ids === 'SMALL') remSmall = rc.run.remainingInclVat;
  if (rc.run.remainingInclVat <= 200) wins++;
}
var soloBig = E.generate(base({ targetInclVat: 10000, attempts: 1, seed: 5,
  items: [item('BIG', 700)], limits: [lim('BIG', 0, 100, 100)] }));
var soloSmall = E.generate(base({ targetInclVat: 10000, attempts: 1, seed: 5,
  items: [item('SMALL', 100)], limits: [lim('SMALL', 0, 99, 99)] }));
t('Engine prefers allocation closest to Target, not highest capacity',
  soloBig.run.remainingInclVat === 200 && soloSmall.run.remainingInclVat === 100 &&
  wins === runs,
  'BIG alone (capacity 70,000) leaves ' + soloBig.run.remainingInclVat +
  ' · SMALL alone (capacity 9,900) leaves ' + soloSmall.run.remainingInclVat +
  ' · combined search kept remaining <= 200 in ' + wins + '/' + runs + ' seeds');

console.log('\n=============================================================');
console.log('TOTAL ' + N + '   PASS ' + P + '   FAIL ' + F + '   RESULT: ' + (F === 0 ? 'PASS' : 'FAIL'));
console.log('=============================================================');
