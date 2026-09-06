/* ============================================================================
   GHS Exp — Distribution DEMO FIXTURE  (STEP 2 · testing only)
   Entirely fictional data used ONLY to demonstrate the Generate UI.
   It is NEVER merged into GHS_DATA, never written anywhere, and never
   touches v6.xlsx, v5.xlsx, ITEM_PRICE_HISTORY or any real operating price.
   ========================================================================== */
window.GHS_FIXTURE = {
  label: { ar: 'بيانات اختبار (وهمية)', en: 'Test fixture (fictional)' },
  types:  [{ id: 'DEMO_T', n: 'نوع اختبار — منظفات' }],
  fyears: [{ id: 'DEMO_FY', label: '2099-2100', start: '2099-09-01', end: '2100-08-31', periods: 12 }],
  monthlyBudgets: [
    { id: 'DEMO_MB1', fy: 'DEMO_FY', t: 'DEMO_T', pi: 1, pm: 9,  inc: 500000, status: 'DEMO' },
    { id: 'DEMO_MB2', fy: 'DEMO_FY', t: 'DEMO_T', pi: 2, pm: 10, inc: 250000, status: 'DEMO' },
    { id: 'DEMO_MB3', fy: 'DEMO_FY', t: 'DEMO_T', pi: 3, pm: 11, inc:      0, status: 'DEMO' }
  ],
  /* every item carries an explicit annual_max — mandatory under the approved rule */
  items: [
    { i: 'DM001', t: 'DEMO_T', n: 'ديتول مطهر 500 مل (اختبار)',      p: 193.80, s: 'APPROVED',  a: true  },
    { i: 'DM002', t: 'DEMO_T', n: 'باسكيت بلاستيك (اختبار)',          p:  79.80, s: 'APPROVED',  a: true  },
    { i: 'DM003', t: 'DEMO_T', n: 'كلور 10 لتر (اختبار)',             p:  79.80, s: 'APPROVED',  a: true  },
    { i: 'DM004', t: 'DEMO_T', n: 'مساحة أرضيات (اختبار)',            p: 484.50, s: 'APPROVED',  a: true  },
    { i: 'DM005', t: 'DEMO_T', n: 'صابون سائل (اختبار)',              p:  41.04, s: 'APPROVED',  a: true  },
    { i: 'DM006', t: 'DEMO_T', n: 'مكنسة داخلية (اختبار)',            p: 963.30, s: 'APPROVED',  a: true  },
    { i: 'DM007', t: 'DEMO_T', n: 'قفازات لاتكس (اختبار)',            p: 205.20, s: 'APPROVED',  a: true  },
    { i: 'DM008', t: 'DEMO_T', n: 'مناديل مبللة (اختبار)',            p: 136.80, s: 'APPROVED',  a: true  },
    /* deliberately not eligible — proves the exclusion rules in the UI */
    { i: 'DM009', t: 'DEMO_T', n: 'صنف بسعر مقترح فقط (اختبار)',      p: 100.00, s: 'SUGGESTED', a: true  },
    { i: 'DM010', t: 'DEMO_T', n: 'صنف بلا سعر تشغيلي (اختبار)',      p: null,   s: 'NONE',      a: true  },
    { i: 'DM011', t: 'DEMO_T', n: 'صنف موقوف (اختبار)',               p: 150.00, s: 'APPROVED',  a: false },
    { i: 'DM012', t: 'DEMO_T', n: 'صنف بلا حد سنوي (اختبار)',         p: 120.00, s: 'APPROVED',  a: true  }
  ],
  limits: [
    { id: 'DL1',  fy: 'DEMO_FY', item: 'DM001', mmin: 10, mmax: 300, amax: 2000 },
    { id: 'DL2',  fy: 'DEMO_FY', item: 'DM002', mmin:  0, mmax: 400, amax: 3000 },
    { id: 'DL3',  fy: 'DEMO_FY', item: 'DM003', mmin:  5, mmax: 500, amax: 4000 },
    { id: 'DL4',  fy: 'DEMO_FY', item: 'DM004', mmin:  0, mmax:  60, amax:  400 },
    { id: 'DL5',  fy: 'DEMO_FY', item: 'DM005', mmin: 20, mmax: 900, amax: 6000 },
    { id: 'DL6',  fy: 'DEMO_FY', item: 'DM006', mmin:  0, mmax:  25, amax:  150 },
    { id: 'DL7',  fy: 'DEMO_FY', item: 'DM007', mmin:  0, mmax: 200, amax: 1500 },
    { id: 'DL8',  fy: 'DEMO_FY', item: 'DM008', mmin:  0, mmax: 250, amax: 2000 },
    { id: 'DL9',  fy: 'DEMO_FY', item: 'DM009', mmin:  0, mmax: 100, amax: 1000 },
    { id: 'DL10', fy: 'DEMO_FY', item: 'DM010', mmin:  0, mmax: 100, amax: 1000 },
    { id: 'DL11', fy: 'DEMO_FY', item: 'DM011', mmin:  0, mmax: 100, amax: 1000 }
    /* DM012 intentionally has NO limits row -> ANNUAL_MAX_NOT_SET */
  ]
};
