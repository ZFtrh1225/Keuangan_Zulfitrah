const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prioritize } = require('../js/action-priorities.js');

const now = new Date('2026-09-25T19:59:00+07:00');
const ctx = (dashboard, goals = []) => ({ dashboard, goals, month: 9, year: 2026, now });

test('ranks the three most urgent actions, including two bills when both are due soon', () => {
  const result = prioritize(ctx({
    manualBills: [{ name: 'Listrik', dueDate: '2026-09-26', amount: 350000 },
      { name: 'Air', dueDate: '2026-09-27', amount: 80000 }],
    categoryBudgets: [{ name: 'Makan', budget: 1000000, spent: 950000 }]
  }, [{ name: 'Laptop', date: '2026-09-01', deadline: '2026-12-31', target: 4000000, saved: 0 }]));
  assert.deepEqual(result.map(x => x.type), ['bill', 'bill', 'budget']);
  assert.equal(result[0].date, '2026-09-26');
  assert.equal(result[0].daysLeft, 1);
  assert.equal(result[1].date, '2026-09-27');
  assert.equal(result[2].remaining, 50000);
  assert.equal(result[2].daysRemaining, 6);
});

test('flags only recently overdue bills, ignores invalid dates and other dashboard months', () => {
  const dashboard = { manualBills: [
    { name: 'Lewat', dueDate: '2026-09-24', amount: 100000 },
    { name: 'Tak valid', dueDate: '2026-09-31', amount: 100000 },
    { name: 'Hari ini', dueDate: '2026-09-25', amount: 90000 },
    { name: 'Jauh', dueDate: '2026-10-04', amount: 80000 }
  ] };
  assert.deepEqual(prioritize(ctx(dashboard)).map(x => x.title),
    ['Tindak lanjuti tagihan Lewat', 'Cek tagihan Hari ini']);
  assert.deepEqual(prioritize({ ...ctx(dashboard), month: 8 }), []);
});

test('manual paid bill disappears, and duplicate subscription prediction is suppressed', () => {
  const result = prioritize(ctx({
    manualBills: [
      { id: 'paid-1', name: 'Listrik', dueDate: '2026-09-25', amount: 200000, paid: true },
      { id: 'open-1', name: 'Internet', dueDate: '2026-10-01', amount: 150000, wallet: 'BRI' }
    ],
    upcomingBills: [
      { name: ' internet ', nextDate: '2026-10-01', avgAmount: 160000, paidThisMonth: false },
      { name: 'Listrik', nextDate: '2026-09-25', avgAmount: 200000, paidThisMonth: false }
    ]
  }));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'open-1');
  assert.equal(result[0].wallet, 'BRI');
  assert.equal(result[0].daysLeft, 6);
});

test('a paid September subscription can still have a new estimated October due date', () => {
  const result = prioritize(ctx({ upcomingBills: [{ name: 'Internet', nextDate: '2026-10-01',
    avgAmount: 120000, paidThisMonth: true, paidForNextDate: false }] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-10-01');
});

test('goal calculations still surface when fewer than three nearer actions exist', () => {
  const [goal] = prioritize(ctx({}, [{ name: 'Laptop', date: '2026-09-01',
    deadline: '2026-12-31', target: 4000000, saved: 0 }]));
  assert.equal(goal.type, 'goal');
  assert.equal(goal.daysLeft, 97);
  assert.equal(goal.monthlyNeeded, Math.ceil(4000000 * 30 / 97));
});

test('subscription estimates require future date, positive amount, and unpaid status', () => {
  const result = prioritize(ctx({ upcomingBills: [
    { name: 'Streaming', nextDate: '2026-09-27', avgAmount: 75000, source: 'Bank', monthCount: 4 },
    { name: 'Sudah dibayar', nextDate: '2026-09-26', avgAmount: 90000, paidThisMonth: true },
    { name: 'Nol', nextDate: '2026-09-26', avgAmount: 0 }
  ] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].predicted, true);
  assert.equal(result[0].amount, 75000);
  assert.equal(result[0].wallet, 'Bank');
});

test('overspent budgets retain the signed deficit; no budgets with missing or zero limit', () => {
  const result = prioritize(ctx({ categoryBudgets: [
    { name: 'Hiburan', budget: 100000, spent: 125000, remaining: 0 },
    { name: 'Nol', budget: 0, spent: 50000 },
    { name: 'Aman', budget: 100000, spent: 89000 }
  ] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].remaining, -25000);
  assert.equal(result[0].ratio, 1.25);
});

test('a goal only appears below its dated linear schedule; past deadlines cannot create fake monthly targets', () => {
  const result = prioritize(ctx({}, [
    { name: 'Tepat', date: '2026-09-01', deadline: '2026-09-30', target: 300000, saved: 290000 },
    { name: 'Sudah selesai', date: '2026-09-01', deadline: '2026-10-01', target: 100000, saved: 120000 },
    { name: 'Lewat', date: '2026-01-01', deadline: '2026-09-24', target: 100000, saved: 1000 },
    { name: 'Belum mulai', date: '2026-09-26', deadline: '2026-12-31', target: 100000, saved: 0 },
    { name: 'Butuh bantuan', date: '2026-01-01', deadline: '2026-10-31', target: 300000, saved: 1000 }
  ]));
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Kejar tujuan Butuh bantuan');
  assert.equal(result[0].daysLeft, 36);
  assert.equal(result[0].monthlyNeeded, Math.ceil(299000 * 30 / 36));
});

test('a deadline today shows a shortfall without dividing by zero or inventing a monthly amount', () => {
  const result = prioritize(ctx({}, [
    { name: 'Biaya kursus', date: '2026-08-25', deadline: '2026-09-25', target: 1000000, saved: 500000 }
  ]));
  assert.equal(result[0].gap, 500000);
  assert.equal(result[0].daysLeft, 0);
  assert.equal(result[0].monthlyNeeded, null);
  assert.equal(result[0].score, 1005);
});
