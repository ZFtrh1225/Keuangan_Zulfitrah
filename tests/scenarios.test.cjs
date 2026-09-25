const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveBaseline, simulate } = require('../js/scenarios.js');

test('the baseline excludes an incomplete current month and reports evidence coverage', () => {
  const baseline = deriveBaseline([
    { year: 2026, month: 6, income: 4000000, expenses: 2000000 },
    { year: 2026, month: 7, income: 6000000, expenses: 3000000 },
    { year: 2026, month: 8, income: 5000000, expenses: 2500000 },
    { year: 2026, month: 9, income: 100000, expenses: 0 }
  ], new Date('2026-09-25T12:00:00'));
  assert.deepEqual(baseline, {
    income: 5000000, expenses: 2500000,
    monthsUsed: 3, incomeMonths: 3, expenseMonths: 3
  });
  assert.equal(deriveBaseline([], new Date('2026-09-25T12:00:00')).monthsUsed, 0);
});

test('goal saving is a wallet transfer; only cashflow and one-time cost change net worth', () => {
  const result = simulate({
    startNetWorth: 10000000, income: 5000000, expenses: 3000000,
    incomeDirection: 'increase', incomeChange: 500000,
    expenseDirection: 'decrease', expenseChange: 200000,
    oneTimeExpense: 1000000, horizon: 12, goalMonthly: 1000000,
    goal: { saved: 2000000, target: 10000000 },
    today: new Date('2026-09-25T12:00:00')
  });
  assert.equal(result.baseSurplus, 2000000);
  assert.equal(result.scenarioSurplus, 2700000);
  assert.equal(result.baselineEnd, 34000000);
  assert.equal(result.scenarioEnd, 41400000);
  assert.equal(result.difference, 7400000);
  assert.equal(result.rows[1].scenario, 11700000);
  assert.equal(result.goalProjected, 10000000);
  assert.equal(result.goalMonthsToTarget, 8);
  assert.equal(result.goalExceedsSurplus, false);
  assert.equal(result.rows[1].label, 'Okt 2026');
});

test('a downside scenario can go below zero without hiding the deficit', () => {
  const result = simulate({
    startNetWorth: 200000, income: 1000000, expenses: 900000,
    incomeDirection: 'decrease', incomeChange: 500000,
    expenseDirection: 'increase', expenseChange: 200000,
    oneTimeExpense: 100000, horizon: 6, goalMonthly: 200000,
    goal: { saved: 0, target: 500000 },
    today: new Date('2026-11-30T12:00:00')
  });
  assert.equal(result.scenarioSurplus, -600000);
  assert.equal(result.scenarioEnd, -3500000);
  assert.equal(result.goalExceedsSurplus, true);
  assert.equal(result.rows[1].label, 'Des 2026');
  assert.equal(result.rows.length, 7);
});

test('invalid reductions and unsupported horizons do not silently produce a projection', () => {
  const valid = {
    startNetWorth: 0, income: 100000, expenses: 50000,
    incomeDirection: 'decrease', incomeChange: 150000,
    expenseDirection: 'decrease', expenseChange: 0,
    oneTimeExpense: 0, horizon: 12, goalMonthly: 0
  };
  assert.throws(() => simulate(valid), /lebih besar/);
  assert.throws(() => simulate({ ...valid, horizon: 61, incomeChange: 0 }), /60 bulan/);
  assert.throws(() => simulate({ ...valid, horizon: 12, incomeChange: NaN }), /Nominal/);
});

test('a goal already over its target never appears to lose money in the simulation', () => {
  const result = simulate({
    startNetWorth: 300000, income: 100000, expenses: 90000,
    incomeChange: 0, expenseChange: 0, oneTimeExpense: 0,
    horizon: 6, goalMonthly: 50000, goal: { saved: 120000, target: 100000 }
  });
  assert.equal(result.goalProjected, 120000);
  assert.equal(result.goalRemaining, 0);
  assert.equal(result.goalMonthsToTarget, 0);
});
