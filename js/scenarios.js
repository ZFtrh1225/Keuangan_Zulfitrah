/**
 * scenarios.js — simulasi arus kas dan kekayaan bersih di browser.
 * Semua angka skenario adalah asumsi; fungsi ini tidak menulis ke backend.
 */
(function (root) {
  'use strict';

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return Math.round(sorted.length % 2
      ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  }

  function deriveBaseline(months, today) {
    const now = today || new Date();
    const current = now.getFullYear() * 12 + now.getMonth();
    const closed = (months || []).filter(m =>
      Number.isInteger(m.year) && Number.isInteger(m.month) &&
      m.year * 12 + m.month - 1 < current &&
      (Number(m.income) > 0 || Number(m.expenses) > 0));
    const incomes = closed.map(m => Number(m.income)).filter(n => Number.isFinite(n) && n > 0);
    const expenses = closed.map(m => Number(m.expenses)).filter(n => Number.isFinite(n) && n > 0);
    return {
      income: median(incomes), expenses: median(expenses),
      monthsUsed: closed.length, incomeMonths: incomes.length, expenseMonths: expenses.length
    };
  }

  function simulate(input) {
    const horizon = Number(input.horizon);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 60) {
      throw new Error('Pilih jangka waktu antara 1 dan 60 bulan.');
    }
    const keys = ['income', 'expenses', 'incomeChange', 'expenseChange', 'oneTimeExpense', 'goalMonthly'];
    const amounts = {};
    keys.forEach(key => {
      const n = Number(input[key]);
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000000) {
        throw new Error('Nominal harus berupa rupiah antara 0 dan 1 triliun.');
      }
      amounts[key] = n;
    });
    const startNetWorth = Number(input.startNetWorth);
    if (!Number.isFinite(startNetWorth) || Math.abs(startNetWorth) > 1000000000000000) {
      throw new Error('Kekayaan bersih saat ini belum tersedia atau di luar batas simulasi.');
    }
    const incomeDirection = input.incomeDirection || 'increase';
    const expenseDirection = input.expenseDirection || 'decrease';
    if (!['increase', 'decrease'].includes(incomeDirection) ||
        !['increase', 'decrease'].includes(expenseDirection)) {
      throw new Error('Arah perubahan pemasukan atau pengeluaran tidak valid.');
    }
    const projectedIncome = amounts.income +
      (incomeDirection === 'increase' ? amounts.incomeChange : -amounts.incomeChange);
    const projectedExpense = amounts.expenses +
      (expenseDirection === 'increase' ? amounts.expenseChange : -amounts.expenseChange);
    if (projectedIncome < 0 || projectedExpense < 0) {
      throw new Error('Penurunan tidak boleh lebih besar daripada nilai bulanan dasarnya.');
    }
    const baseSurplus = amounts.income - amounts.expenses;
    const scenarioSurplus = projectedIncome - projectedExpense;
    const today = input.today || new Date();
    const rows = [{ label: 'Saat ini', month: 0, baseline: startNetWorth, scenario: startNetWorth }];
    for (let month = 1; month <= horizon; month++) {
      const date = new Date(Date.UTC(today.getFullYear(), today.getMonth() + month, 1));
      rows.push({
        month,
        label: date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        baseline: startNetWorth + baseSurplus * month,
        scenario: startNetWorth + scenarioSurplus * month - amounts.oneTimeExpense
      });
    }
    const goal = input.goal || null;
    const goalSaved = goal ? Number(goal.saved) || 0 : 0;
    const goalTarget = goal ? Number(goal.target) || 0 : 0;
    const goalProjected = goal && goalTarget > 0
      ? Math.max(goalSaved, Math.min(goalTarget, goalSaved + amounts.goalMonthly * horizon)) : null;
    const goalRemaining = goalProjected == null ? null : Math.max(0, goalTarget - goalProjected);
    return {
      rows, baseSurplus, scenarioSurplus, projectedIncome, projectedExpense,
      baselineEnd: rows[rows.length - 1].baseline,
      scenarioEnd: rows[rows.length - 1].scenario,
      difference: rows[rows.length - 1].scenario - rows[rows.length - 1].baseline,
      goalProjected, goalRemaining,
      goalMonthsToTarget: goal && goalTarget > 0 && goalSaved >= goalTarget ? 0
        : goal && amounts.goalMonthly > 0 && goalTarget > 0
          ? Math.ceil(Math.max(0, goalTarget - goalSaved) / amounts.goalMonthly) : null,
      goalExceedsSurplus: !!goal && goalSaved < goalTarget &&
        amounts.goalMonthly > Math.max(0, scenarioSurplus)
    };
  }

  const engine = { deriveBaseline, simulate };
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.MT.scenarios = engine;
})(typeof window !== 'undefined' ? window : globalThis);
