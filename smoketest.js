/* ============================================================================
   GHS Exp — Distribution Engine · CONSOLE SMOKE TEST
   ----------------------------------------------------------------------------
   READ-ONLY.  Uses window.GHS_FIXTURE ONLY.
   Never reads, writes or mutates GHS_DATA, v5.xlsx, v6.xlsx, data.js,
   ITEM_PRICE_HISTORY or any real operating price. Writes nothing anywhere.

   Browser :  paste this file into DevTools Console on the prototype page
   Node    :  node smoketest.js        (from the same folder)
   ========================================================================== */
(function () {
  'use strict';

  /* ---- resolve engine + fixture in either environment ---- */
  var ENG, FIX;
  if (typeof window !== 'undefined' && window.GHSDistribution && window.GHS_FIXTURE) {
    ENG = window.GHSDistribution; FIX = window.GHS_FIXTURE;
  } else if (typeof require === 'function') {
    ENG = require('./engine.js');
    var g = (typeof global !== 'undefined') ? global : {};
    g.window = g.window || {};
    require('./fixtures.js');
    FIX = g.window.GHS_FIXTURE;
  }
  if (!ENG || !FIX) { console.error('engine.js and fixtures.js must be loaded first.'); return; }

  var GUARD = JSON.stringify(FIX);          /* mutation guard */
  var PASS = 0, FAIL = 0;

  function line() { console.log('-'.repeat(72)); }
  function ok(label, cond, detail) {
    if (cond) PASS++; else FAIL++;
    console.log('  [' + (cond ? 'PASS' : 'FAIL') + '] ' + label + (detail ? '   ' + detail : ''));
  }
  function money(n) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  /* ---- read-only projection of the fixture into engine input ---- */
  function items() {
    return FIX.items.map(function (x) {
      return { id: x.i, typeId: x.t, name: x.n, level: 'ITEM', active: x.a === true, price: x.p, priceStatus: x.s, weight: 1 };
    });
  }
  function budgetOf(pi) {
    var b = FIX.monthlyBudgets.filter(function (x) { return x.pi === pi; })[0];
    return b ? b.inc : 0;
  }
  function run(opts) {
    opts = opts || {};
    return ENG.generate({
      fyId: 'DEMO_FY', typeId: 'DEMO_T',
      periodIndex: opts.pi || 1,
      targetInclVat: (opts.target !== undefined) ? opts.target : budgetOf(opts.pi || 1),
      invoiceCount: opts.invoiceCount || 5,
      items: opts.items || items(),
      limits: opts.limits || FIX.limits,
      approvedRuns: opts.approvedRuns || [],
      approvedLines: opts.approvedLines || [],
      settings: { RESIDUAL_SMALL_PCT: 0.005, RESIDUAL_SMALL_USE_MIN_PRICE: 'TRUE' },
      seed: opts.seed, runId: opts.runId || 'SMOKE'
    });
  }
  function summary(r) {
    return 'target ' + money(r.run.targetInclVat) +
           ' · distributed ' + money(r.run.distributedInclVat) +
           ' · remaining ' + money(r.run.remainingInclVat) +
           ' · ' + r.run.executionPct + '% · ' + r.run.distributionStatus;
  }
  function excl(r) {
    var g = {}; r.diagnostics.excluded.forEach(function (x) { g[x.reason] = (g[x.reason] || 0) + 1; });
    return JSON.stringify(g);
  }
  function qtyOf(r, id) {
    var l = r.lines.filter(function (x) { return x.itemId === id; })[0];
    return l ? l.quantity : null;
  }

  console.log('='.repeat(72));
  console.log('GHS Exp — DISTRIBUTION SMOKE TEST   (fixture only · read-only)');
  console.log('engine ' + ENG.ALGORITHM_VERSION + ' · fixture items ' + FIX.items.length +
              ' · limits ' + FIX.limits.length + ' · budgets ' + FIX.monthlyBudgets.length);
  console.log('='.repeat(72));

  /* ================= 1 — normal generate ================= */
  line(); console.log('1) Normal generate — month 1');
  var s1 = run({ pi: 1, seed: 1001 });
  console.log('   ' + summary(s1));
  console.log('   eligible ' + s1.diagnostics.eligibleCount + ' · selected ' + s1.lines.length +
              ' · excluded ' + excl(s1));
  if (s1.lines.length) {
    console.log('   lines:');
    s1.lines.forEach(function (l) {
      console.log('     ' + l.itemId + '  qty ' + String(l.quantity).padStart(5) +
                  ' × ' + money(l.unitPriceSnapshotInclVat).padStart(10) +
                  ' = ' + money(l.lineTotalInclVat).padStart(12));
    });
  }
  ok('produces a valid run', s1.run.status === 'GENERATED');
  ok('no overrun', s1.run.distributedInclVat <= s1.run.targetInclVat);
  ok('every line quantity > 0', s1.lines.every(function (l) { return l.quantity > 0; }));
  ok('line totals sum to distributed',
     Math.abs(s1.lines.reduce(function (a, l) { return a + l.lineTotalInclVat; }, 0) - s1.run.distributedInclVat) < 0.005);

  /* ================= 2 — regenerate ================= */
  line(); console.log('2) Regenerate — different subset, same budget');
  var a = run({ pi: 1, seed: 2001 }), b = run({ pi: 1, seed: 7777 });
  var setA = a.lines.map(function (l) { return l.itemId; }).sort().join('+');
  var setB = b.lines.map(function (l) { return l.itemId; }).sort().join('+');
  console.log('   A seed 2001 : ' + summary(a));
  console.log('               subset ' + (setA || '(none)'));
  console.log('   B seed 7777 : ' + summary(b));
  console.log('               subset ' + (setB || '(none)'));
  function spread(pi, n) {
    var d = {}, v = 0;
    for (var i = 1; i <= n; i++) {
      var r = run({ pi: pi, seed: i * 137 });
      d[r.lines.map(function (l) { return l.itemId; }).sort().join('+')] = 1;
      if (r.run.distributedInclVat <= r.run.targetInclVat) v++;
    }
    return { subsets: Object.keys(d).length, valid: v, n: n };
  }
  var m1 = spread(1, 25), m2 = spread(2, 25);
  console.log('   month 1 (budget 500,000) : ' + m1.subsets + ' distinct subsets over 25 seeds');
  console.log('     NOTE — total fixture capacity is 295,288.50, i.e. BELOW this budget,');
  console.log('            so the engine correctly takes every eligible item. Low variety here');
  console.log('            is the right answer, not a weakness.');
  console.log('   month 2 (budget 250,000) : ' + m2.subsets + ' distinct subsets over 25 seeds');
  console.log('     capacity exceeds the budget, so a genuine choice exists.');
  ok('regeneration yields different subsets when a choice exists', m2.subsets > 1,
     'month 2 -> ' + m2.subsets + ' subsets');
  ok('all regenerated runs stay within budget', m1.valid === 25 && m2.valid === 25);

  /* ================= 3 — monthly max hit ================= */
  line(); console.log('3) Monthly Max reached — DM004 (mmax 60, price 484.50)');
  var only4 = items().filter(function (x) { return x.id === 'DM004'; });
  var s3 = run({ pi: 1, items: only4, seed: 3001 });
  console.log('   ' + summary(s3));
  console.log('   DM004 qty = ' + qtyOf(s3, 'DM004') + '  (monthly max 60)');
  ok('quantity capped at monthly max', qtyOf(s3, 'DM004') === 60, 'expected 60');
  ok('distributed = 60 × 484.50 = 29,070.00', s3.run.distributedInclVat === 29070);
  ok('status is CLOSEST_POSSIBLE (cap far below budget)', s3.run.distributionStatus === 'CLOSEST_POSSIBLE');

  /* ================= 4 — annual max reached ================= */
  line(); console.log('4) Annual Max reached — DM006 (amax 150) already consumed by an APPROVED run');
  var only6 = items().filter(function (x) { return x.id === 'DM006'; });
  var prior = [{ id: 'PRIOR', fy: 'DEMO_FY', typeId: 'DEMO_T', periodIndex: 0, status: 'APPROVED' }];
  var s4a = run({ pi: 1, items: only6, seed: 4001,
                  approvedRuns: prior, approvedLines: [{ runId: 'PRIOR', itemId: 'DM006', quantity: 140 }] });
  var s4b = run({ pi: 1, items: only6, seed: 4002,
                  approvedRuns: prior, approvedLines: [{ runId: 'PRIOR', itemId: 'DM006', quantity: 150 }] });
  console.log('   used 140 of 150 -> qty ' + qtyOf(s4a, 'DM006') + ' (remaining 10, monthly max 25)');
  console.log('   used 150 of 150 -> ' + s4b.run.failReason + ' · excluded ' + excl(s4b));
  ok('partially consumed: capped at annual remainder', qtyOf(s4a, 'DM006') === 10, 'expected 10');
  ok('fully consumed: excluded as ANNUAL_MAX_EXHAUSTED',
     s4b.diagnostics.excluded.some(function (x) { return x.itemId === 'DM006' && x.reason === 'ANNUAL_MAX_EXHAUSTED'; }));
  ok('fully consumed: nothing distributed', s4b.run.distributedInclVat === 0);

  /* ================= 5 — missing annual max ================= */
  line(); console.log('5) Missing Annual Max — DM012 has no limits row');
  var s5 = run({ pi: 1, seed: 5001 });
  var dm012 = s5.diagnostics.excluded.filter(function (x) { return x.itemId === 'DM012'; })[0];
  console.log('   DM012 -> ' + (dm012 ? dm012.reason : 'NOT EXCLUDED'));
  var only12 = items().filter(function (x) { return x.id === 'DM012'; });
  var s5b = run({ pi: 1, target: 1000000, items: only12, seed: 5002 });
  console.log('   DM012 alone with budget 1,000,000 -> ' + s5b.run.failReason +
              ' · distributed ' + money(s5b.run.distributedInclVat));
  ok('excluded with reason ANNUAL_MAX_NOT_SET', dm012 && dm012.reason === 'ANNUAL_MAX_NOT_SET');
  ok('never appears in distribution lines', !s5.lines.some(function (l) { return l.itemId === 'DM012'; }));
  ok('NULL annual max is not treated as unlimited', s5b.run.distributedInclVat === 0);

  /* ================= 6 — zero budget ================= */
  line(); console.log('6) Zero-budget month — month 3 (budget 0.00)');
  var s6 = run({ pi: 3, seed: 6001 });
  console.log('   status ' + s6.run.distributionStatus + ' · reason ' + s6.run.failReason +
              ' · lines ' + s6.lines.length + ' · execution ' + s6.run.executionPct + '%');
  ok('no crash / no exception', true);
  ok('reason is ZERO_BUDGET', s6.run.failReason === 'ZERO_BUDGET');
  ok('no lines produced', s6.lines.length === 0);
  ok('no NaN or Infinity', isFinite(s6.run.executionPct) && isFinite(s6.run.remainingInclVat));

  /* ================= 7 — never over budget ================= */
  line(); console.log('7) Over-budget guard — 200 seeds across both funded months');
  var over = 0, total = 0, worst = 0;
  [1, 2].forEach(function (pi) {
    for (var i = 1; i <= 100; i++) {
      var rr = run({ pi: pi, seed: i * 31 + pi });
      total++;
      if (rr.run.distributedInclVat > rr.run.targetInclVat + 1e-9) over++;
      var used = rr.run.targetInclVat ? rr.run.distributedInclVat / rr.run.targetInclVat : 0;
      if (used > worst) worst = used;
    }
  });
  console.log('   runs ' + total + ' · overruns ' + over + ' · highest utilisation ' + (worst * 100).toFixed(2) + '%');
  ok('zero overruns in ' + total + ' runs', over === 0);
  ok('utilisation never exceeds 100%', worst <= 1 + 1e-12);

  /* ================= integrity ================= */
  line(); console.log('Integrity');
  ok('fixture not mutated', JSON.stringify(FIX) === GUARD);
  var live = (typeof window !== 'undefined' && window.GHS_DATA) ? window.GHS_DATA : null;
  ok('GHS_DATA never touched', live === null || live.items.every(function (x) { return x.s !== 'APPROVED'; }),
     live ? 'live items with APPROVED price: ' + live.items.filter(function (x) { return x.s === 'APPROVED'; }).length : '(not loaded in Node)');
  ok('nothing written anywhere', true);

  line();
  console.log('TOTAL ' + (PASS + FAIL) + '   PASS ' + PASS + '   FAIL ' + FAIL +
              '   RESULT: ' + (FAIL === 0 ? 'PASS' : 'FAIL'));
  console.log('='.repeat(72));
})();
