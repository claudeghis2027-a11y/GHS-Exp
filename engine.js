/* ============================================================================
   GHS Exp — Distribution Engine  (STEP 2)
   Pure logic. No DOM. No storage. No network. No Excel write.
   Money handled as INTEGER PIASTRES, entirely in VAT-INCLUSIVE space.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GHSDistribution = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ALGORITHM_VERSION = 'DE-1.1.0';

  /* ---------- seeded RNG (mulberry32) — reproducible ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeSeed() { return (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0; }

  /* ---------- money helpers ---------- */
  var P = function (egp) { return Math.round(Number(egp) * 100); };   // EGP -> piastres
  var E = function (p) { return Math.round(p) / 100; };               // piastres -> EGP
  var INF = Number.POSITIVE_INFINITY;

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  /* ==========================================================================
     ANNUAL USAGE — from APPROVED runs + their lines only. No ledger.
     ========================================================================== */
  function annualUsedQty(itemId, fyId, approvedRuns, approvedLines) {
    var ids = {};
    (approvedRuns || []).forEach(function (r) {
      if (r.fy === fyId && r.status === 'APPROVED') ids[r.id] = 1;
    });
    var used = 0;
    (approvedLines || []).forEach(function (l) {
      if (ids[l.runId] && l.itemId === itemId) used += Number(l.quantity) || 0;
    });
    return used;
  }

  /* ==========================================================================
     ELIGIBILITY
     ========================================================================== */
  function buildEligible(input) {
    var limitsIdx = {};
    (input.limits || []).forEach(function (l) {
      if (l.fy === input.fyId) limitsIdx[l.item] = l;
    });

    var eligible = [], excluded = [];
    (input.items || []).forEach(function (it) {
      if (it.typeId !== input.typeId) return;                       // other expense type

      var why = null;
      if (it.level !== 'ITEM') why = 'NOT_ITEM_LEVEL';               // ROLLUP / MONTHLY_SUM / REFERENCE_ONLY
      else if (it.active !== true) why = 'INACTIVE';
      else if (!(Number(it.price) > 0)) why = 'NO_OPERATING_PRICE';
      else if (it.priceStatus !== 'APPROVED') why = 'PRICE_NOT_APPROVED';

      if (why) { excluded.push({ itemId: it.id, reason: why }); return; }

      var lim = limitsIdx[it.id] || {};
      var amax = numOrNull(lim.amax);                                // MANDATORY — null => not ready
      var mmax = numOrNull(lim.mmax);                                // null => no monthly ceiling
      var mmin = numOrNull(lim.mmin); if (mmin === null) mmin = 0;   // null => 0 (no minimum)

      /* Annual Max is MANDATORY for distribution. NULL/blank is NOT unconstrained. */
      if (amax === null) { excluded.push({ itemId: it.id, reason: 'ANNUAL_MAX_NOT_SET' }); return; }
      if (!(amax > 0))   { excluded.push({ itemId: it.id, reason: 'ANNUAL_MAX_NOT_SET' }); return; }

      var used = annualUsedQty(it.id, input.fyId, input.approvedRuns, input.approvedLines);
      var remAnnual = amax - used;
      var remMonthly = (mmax === null) ? INF : mmax;

      if (!(remAnnual > 0)) { excluded.push({ itemId: it.id, reason: 'ANNUAL_MAX_EXHAUSTED' }); return; }
      if (!(remMonthly > 0)) { excluded.push({ itemId: it.id, reason: 'MONTHLY_MAX_ZERO' }); return; }

      var allowedMax = Math.min(remAnnual, remMonthly);
      if (mmin > allowedMax) { excluded.push({ itemId: it.id, reason: 'MIN_EXCEEDS_ALLOWED_MAX' }); return; }

      eligible.push({
        id: it.id, name: it.name || it.id,
        pricePi: P(it.price), priceEgp: Number(it.price),
        weight: (Number(it.weight) > 0 ? Number(it.weight) : 1),
        mmin: mmin, allowedMax: allowedMax,
        usedAnnual: used, amax: amax, mmax: mmax
      });
    });
    return { eligible: eligible, excluded: excluded };
  }

  /* ==========================================================================
     SUBSET SELECTION — weighted, seeded, capability-checked
     ========================================================================== */
  function weightedDraw(pool, k, rand) {
    var src = pool.slice(), out = [];
    while (out.length < k && src.length) {
      var tot = 0;
      src.forEach(function (x) { tot += x.weight * (1 + (rand() - 0.5) * 0.3); });
      var r = rand() * tot, acc = 0, pick = src.length - 1;
      for (var i = 0; i < src.length; i++) {
        acc += src[i].weight * (1 + (rand() - 0.5) * 0.3);
        if (acc >= r) { pick = i; break; }
      }
      out.push(src.splice(pick, 1)[0]);
    }
    return out;
  }

  function drawCandidate(pool, targetPi, rand) {
    var k = 1 + Math.floor(rand() * pool.length);
    var pick = weightedDraw(pool, k, rand);

    /* drop items until the mandatory minimums fit inside the target */
    pick.sort(function (x, y) { return (y.mmin * y.pricePi) - (x.mmin * x.pricePi); });
    while (pick.length) {
      var f = 0; pick.forEach(function (x) { f += x.mmin * x.pricePi; });
      if (f <= targetPi) break;
      pick.pop();
    }
    if (!pick.length) return null;

    var floorPi = 0, capPi = 0;
    pick.forEach(function (x) {
      floorPi += x.mmin * x.pricePi;
      capPi += (x.allowedMax === INF ? targetPi : x.allowedMax * x.pricePi);
    });
    return { items: pick, floorPi: floorPi, capPi: capPi };
  }

  /* HEURISTIC SEARCH — not exact optimisation.
     Each candidate subset is fully ALLOCATED, then the candidate whose actual
     Distributed is CLOSEST TO (and never above) the Target is kept.
     A subset with higher capacity does NOT win if another subset allocates closer. */
  function searchBest(pool, targetPi, rand, attempts) {
    var best = null;
    for (var a = 0; a < (attempts || 40); a++) {
      var cand = drawCandidate(pool, targetPi, rand);
      if (!cand) continue;
      var res = allocate(cand, targetPi, rand);
      if (res.spentPi > targetPi) continue;                           // never accept an overrun
      var remaining = targetPi - res.spentPi;
      if (!best || remaining < best.remaining) {
        best = { sel: cand, res: res, remaining: remaining };
        if (remaining === 0) break;                                   // exact — stop searching
      }
    }
    return best;
  }

  /* ==========================================================================
     ALLOCATION — min first, weighted spread, greedy residual repair
     ========================================================================== */
  function allocate(sel, targetPi, rand) {
    var alloc = sel.items.map(function (x) { return { it: x, qty: x.mmin }; });

    var spent = 0;
    alloc.forEach(function (a) { spent += a.qty * a.it.pricePi; });

    /* phase 2 — weighted spread of the remainder */
    var residual = targetPi - spent;
    if (residual > 0) {
      var tw = 0; alloc.forEach(function (a) { tw += a.it.weight; });
      alloc.forEach(function (a) {
        if (residual <= 0) return;
        var share = Math.floor(residual * (a.it.weight / tw));
        var add = Math.floor(share / a.it.pricePi);
        var room = (a.it.allowedMax === INF ? Infinity : a.it.allowedMax - a.qty);
        add = Math.min(add, room);
        if (add > 0) { a.qty += add; spent += add * a.it.pricePi; }
      });
      residual = targetPi - spent;
    }

    /* phase 3 — greedy residual repair (largest unit that still fits) */
    var guard = 0;
    while (residual > 0 && guard++ < 20000) {
      var cands = alloc.filter(function (a) {
        var room = (a.it.allowedMax === INF ? Infinity : a.it.allowedMax - a.qty);
        return room > 0 && a.it.pricePi <= residual;
      });
      if (!cands.length) break;
      cands.sort(function (x, y) { return y.it.pricePi - x.it.pricePi; });
      var t = cands[0];
      t.qty += 1; spent += t.it.pricePi; residual = targetPi - spent;
    }

    return { alloc: alloc.filter(function (a) { return a.qty > 0; }), spentPi: spent };
  }

  /* ==========================================================================
     STATUS
     ========================================================================== */
  function classify(targetPi, spentPi, pool, settings) {
    if (spentPi > targetPi) return 'OVER_BUDGET';
    var rem = targetPi - spentPi;
    if (rem === 0) return 'EXACT';
    var pct = Number((settings && settings.RESIDUAL_SMALL_PCT) || 0.005);
    var smallByPct = rem <= Math.floor(targetPi * pct);
    var useMin = String((settings && settings.RESIDUAL_SMALL_USE_MIN_PRICE) || 'TRUE').toUpperCase() === 'TRUE';
    var cheapest = pool.length ? Math.min.apply(null, pool.map(function (x) { return x.pricePi; })) : 0;
    var smallByPrice = useMin && cheapest > 0 && rem <= cheapest;
    return (smallByPct || smallByPrice) ? 'PARTIAL' : 'CLOSEST_POSSIBLE';
  }

  /* ==========================================================================
     GENERATE
     ========================================================================== */
  function generate(input) {
    var seed = (input.seed === undefined || input.seed === null) ? makeSeed() : (input.seed >>> 0);
    var rand = rng(seed);
    var targetPi = P(input.targetInclVat || 0);
    var stamp = input.now || new Date().toISOString();

    function fail(reason, detail, pool, exc) {
      return {
        run: {
          runId: input.runId || null, fyId: input.fyId, typeId: input.typeId,
          periodIndex: input.periodIndex, targetInclVat: E(targetPi),
          invoiceCount: numOrNull(input.invoiceCount),
          distributedInclVat: 0, remainingInclVat: E(targetPi), executionPct: 0,
          distributionStatus: 'INFEASIBLE', failReason: reason,
          randomSeed: seed, algorithmVersion: ALGORITHM_VERSION,
          generatedAt: stamp, generatedBy: input.generatedBy || null, status: 'FAILED'
        },
        lines: [],
        diagnostics: { reason: reason, detail: detail || '', eligibleCount: (pool || []).length, excluded: exc || [] }
      };
    }

    var el = buildEligible(input);
    var pool = el.eligible;

    if (targetPi <= 0) return fail('ZERO_BUDGET', 'Monthly budget is zero or missing.', pool, el.excluded);
    if (!pool.length) return fail('NO_ELIGIBLE_ITEMS', 'No item satisfies the eligibility rules.', pool, el.excluded);

    var minFloorPi = Math.min.apply(null, pool.map(function (x) { return x.mmin * x.pricePi; }));
    if (minFloorPi > targetPi)
      return fail('MIN_EXCEEDS_BUDGET', 'Smallest monthly minimum already exceeds the budget.', pool, el.excluded);

    var best = searchBest(pool, targetPi, rand, input.attempts || 40);
    if (!best || !best.sel.items.length)
      return fail('NO_FEASIBLE_SUBSET', 'Could not form a subset that respects the monthly minimums.', pool, el.excluded);

    var res = best.res;
    var spentPi = res.spentPi;
    var status = classify(targetPi, spentPi, pool, input.settings || {});
    var remPi = targetPi - spentPi;

    var lines = res.alloc.map(function (a, i) {
      return {
        lineId: null, runId: input.runId || null, itemId: a.it.id, itemName: a.it.name,
        quantity: a.qty,
        unitPriceSnapshotInclVat: a.it.priceEgp,
        lineTotalInclVat: E(a.qty * a.it.pricePi),
        weightUsed: a.it.weight,
        remainingBefore: (a.it.allowedMax === INF ? null : a.it.allowedMax),
        remainingAfter: (a.it.allowedMax === INF ? null : a.it.allowedMax - a.qty),
        lineSeq: i + 1
      };
    });

    return {
      run: {
        runId: input.runId || null, fyId: input.fyId, typeId: input.typeId,
        periodIndex: input.periodIndex, targetInclVat: E(targetPi),
        invoiceCount: numOrNull(input.invoiceCount),          /* stored only — not a constraint */
        distributedInclVat: E(spentPi), remainingInclVat: E(remPi),
        executionPct: targetPi > 0 ? Math.round((spentPi / targetPi) * 10000) / 100 : 0,
        distributionStatus: status, failReason: null,
        randomSeed: seed, algorithmVersion: ALGORITHM_VERSION,
        generatedAt: stamp, generatedBy: input.generatedBy || null,
        status: (status === 'OVER_BUDGET') ? 'FAILED' : 'GENERATED',
        itemsSelected: lines.length, itemsEligible: pool.length
      },
      lines: lines,
      diagnostics: { reason: null, detail: '', eligibleCount: pool.length, excluded: el.excluded }
    };
  }

  return {
    ALGORITHM_VERSION: ALGORITHM_VERSION,
    generate: generate,
    buildEligible: buildEligible,
    _searchBest: searchBest,
    annualUsedQty: annualUsedQty,
    makeSeed: makeSeed,
    _rng: rng
  };
});
