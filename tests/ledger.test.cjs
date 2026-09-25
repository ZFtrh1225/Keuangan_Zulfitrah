const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend(fixedNow) {
  const sheets = new Map();
  const cache = new Map();
  const properties = new Map();
  let nextId = 0;

  class Sheet {
    constructor() { this.rows = []; }
    getLastRow() { return this.rows.length; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getRange(row, col, height = 1, width = 1) {
      const sheet = this;
      return {
        getValues() {
          return Array.from({ length: height }, (_, i) =>
            Array.from({ length: width }, (_, j) => sheet.rows[row + i - 1]?.[col + j - 1] ?? ''));
        },
        getValue() { return sheet.rows[row - 1]?.[col - 1] ?? ''; },
        setValues(values) {
          values.forEach((valuesRow, i) => valuesRow.forEach((value, j) => {
            sheet.rows[row + i - 1] ||= [];
            sheet.rows[row + i - 1][col + j - 1] = value;
          }));
          return this;
        },
        setValue(value) { return this.setValues([[value]]); },
        setFontWeight() { return this; },
        setBackground() { return this; },
        setFontColor() { return this; }
      };
    }
    appendRow(row) { this.rows.push(row); }
    deleteRow(row) { this.rows.splice(row - 1, 1); }
    setFrozenRows() {}
  }

  const spreadsheet = {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; }
  };
  const scriptProperties = {
    getProperty(key) { return properties.get(key) || null; },
    setProperty(key, value) { properties.set(key, value); }
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => cache.set(key, value),
      removeAll: keys => keys.forEach(key => cache.delete(key))
    }) },
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
      getDocumentProperties: () => scriptProperties
    },
    Utilities: {
      getUuid: () => `version-${++nextId}`,
      formatDate: (date) => new Date(date).toISOString().slice(0, 10)
    },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    console
  };
  if (fixedNow) {
    context.Date = class extends Date {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return new Date(fixedNow).getTime(); }
    };
    context.Utilities.formatDate = date => {
      const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date(date)).map(part => [part.type, part.value]));
      return `${pieces.year}-${pieces.month}-${pieces.day}`;
    };
  }
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context);
  return { context, sheets, cache };
}

test('a saving moves money between wallets without shrinking net worth', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  app.addIncome({ date: '2026-09-01', type: 'Gaji', amount: 1000000, source: 'Cash' });
  assert.equal(app.addSaving({ date: '2026-09-02', type: 'Tabungan Rutin', amount: 200000,
    source: 'Cash', destination: 'BRI' }).success, true);
  const data = app.getDashboardData(9, 2026);
  assert.equal(data.walletBalances.Cash, 800000);
  assert.equal(data.walletBalances.BRI, 200000);
  assert.equal(data.netWorth.netWorth, 1000000);
  assert.equal(data.summary.savingsRate, 20);
  assert.equal(data.legacySavingsCount, 0);
  assert.deepEqual(Array.from(sheets.get('Savings').rows[0]),
    ['Date', 'Type', 'Amount', 'Notes', 'Source', 'Destination', 'GoalId']);
});

test('legacy savings stay unchanged until their origin is reconciled', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  sheets.get('Savings').appendRow(['2026-09-02', 'Tabungan Rutin', 200000, '', 'BRI']);
  const before = app.getDashboardData(9, 2026);
  assert.equal(before.walletBalances.BRI, -200000);
  assert.equal(before.legacySavingsCount, 1);
  const edit = app.editTransaction({ sheet: 'saving', rowIndex: 2,
    fields: { source: 'Cash', destination: 'BRI' } });
  assert.equal(edit.success, true);
  const after = app.getDashboardData(9, 2026);
  assert.equal(after.walletBalances.Cash, -200000);
  assert.equal(after.walletBalances.BRI, 200000);
  assert.equal(after.legacySavingsCount, 0);
});

test('an investment wallet does not inflate the emergency fund', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  sheets.get('Wallets').appendRow(['Investasi', 0, '2026-09-01', 'Investasi', '', '']);
  app.addIncome({ date: '2026-09-01', type: 'Gaji', amount: 1000000, source: 'Cash' });
  app.addSaving({ date: '2026-09-02', type: 'Saham', amount: 200000,
    source: 'Cash', destination: 'Investasi' });
  const data = app.getDashboardData(9, 2026);
  assert.equal(data.netWorth.netWorth, 1000000);
  assert.equal(data.netWorth.liquidAssets, 800000);
  assert.equal(data.netWorth.investmentAssets, 200000);
});

test('mutations cannot return a cached dashboard from before the write', () => {
  const { context: app } = backend();
  assert.equal(app.getDashboardData(9, 2026).summary.totalInc, 0);
  app.addIncome({ date: '2026-09-01', type: 'Gaji', amount: 400000, source: 'Cash' });
  assert.equal(app.getDashboardData(9, 2026).summary.totalInc, 400000);
});

test('legacy goal progress is preserved and a linked saving updates it once', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  sheets.get('Goals').appendRow(['2026-01-01', 'Dana Darurat', 1000000, 300000,
    '2027-01-01', 'Dana Darurat', '', false, 6]);
  const goal = app.listGoals().goals[0];
  assert.ok(goal.id);
  assert.equal(goal.savedBaseline, 300000);
  assert.equal(goal.saved, 300000);
  assert.equal(sheets.get('Goals').rows[1][3], 300000);

  assert.equal(app.addSaving({ date: '2026-09-02', type: 'Setoran Tujuan', amount: 200000,
    source: 'Cash', destination: 'BRI', goalId: goal.id }).success, true);
  const updated = app.listGoals().goals[0];
  assert.equal(updated.id, goal.id);
  assert.equal(updated.saved, 500000);
  assert.equal(updated.linkedCount, 1);
  assert.equal(sheets.get('Goals').rows[1][3], 300000);
  assert.equal(app.getDashboardData(9, 2026).netWorth.netWorth, 0);

  app.editTransaction({ sheet: 'saving', rowIndex: 2, fields: {
    amount: 100000, source: 'Cash', destination: 'BRI', goalId: goal.id
  } });
  assert.equal(app.listGoals().goals[0].saved, 400000);
  app.deleteTransaction('saving', 2);
  assert.equal(app.listGoals().goals[0].saved, 300000);
});

test('goal IDs survive row shifts and deleting a goal preserves transfers', () => {
  const { context: app, sheets } = backend();
  app.addGoal({ name: 'Tujuan A', target: 1000000, saved: 0 });
  app.addGoal({ name: 'Tujuan B', target: 1000000, saved: 50000 });
  const [a, b] = app.listGoals().goals;
  app.addSaving({ date: '2026-09-02', type: 'Setoran Tujuan', amount: 20000,
    source: 'Cash', destination: 'BRI', goalId: b.id });
  app.deleteGoal(a.rowIndex);
  assert.equal(app.listGoals().goals[0].id, b.id);
  assert.equal(app.listGoals().goals[0].saved, 70000);
  const deleted = app.deleteGoal(2);
  assert.match(deleted.msg, /1 transaksi tabungan tetap tersimpan/);
  assert.equal(sheets.get('Savings').rows[1][6], '');
  assert.equal(sheets.get('Savings').rows.length, 2);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 20000);
});

test('relinking a saving moves goal progress without another money movement', () => {
  const { context: app } = backend();
  app.addGoal({ name: 'A', target: 100000 });
  app.addGoal({ name: 'B', target: 100000 });
  const [a, b] = app.listGoals().goals;
  app.addSaving({ date: '2026-09-02', type: 'Tabungan', amount: 30000,
    source: 'Cash', destination: 'BRI', goalId: a.id });
  const before = app.getDashboardData(9, 2026).walletBalances;
  app.editTransaction({ sheet: 'saving', rowIndex: 2,
    fields: { goalId: b.id, source: 'Cash', destination: 'BRI' } });
  const [newA, newB] = app.listGoals().goals;
  assert.equal(newA.saved, 0);
  assert.equal(newB.saved, 30000);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.Cash, before.Cash);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, before.BRI);
});

test('an unknown goal cannot create or relink a saving', () => {
  const { context: app, sheets } = backend();
  const rejected = app.addSaving({ date: '2026-09-02', type: 'Setoran Tujuan', amount: 10000,
    source: 'Cash', destination: 'BRI', goalId: 'missing' });
  assert.equal(rejected.success, false);
  assert.equal(sheets.get('Savings').rows.length, 1);
  app.addSaving({ date: '2026-09-02', type: 'Tabungan', amount: 10000,
    source: 'Cash', destination: 'BRI' });
  const edit = app.editTransaction({ sheet: 'saving', rowIndex: 2,
    fields: { goalId: 'missing', amount: 9000 } });
  assert.equal(edit.success, false);
  assert.equal(sheets.get('Savings').rows[1][2], 10000);
});

test('goal migration appends IDs without overwriting custom sheet columns', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  const goals = sheets.get('Goals');
  const savings = sheets.get('Savings');
  goals.rows[0].splice(9, 0, 'Custom');
  goals.appendRow(['2026-01-01', 'Pendidikan', 1000000, 100000,
    '2027-01-01', 'Pendidikan', '', false, 6, 'keep me', '']);
  savings.rows[0].splice(6, 0, 'Custom');

  const goal = app.listGoals().goals[0];
  assert.ok(goal.id);
  assert.equal(goals.rows[1][9], 'keep me');
  assert.equal(goals.rows[1][10], goal.id);
  app.addSaving({ date: '2026-09-02', type: 'Setoran Tujuan', amount: 50000,
    source: 'Cash', destination: 'BRI', goalId: goal.id });
  assert.equal(savings.rows[1][6], '');
  assert.equal(savings.rows[1][7], goal.id);
  assert.equal(app.listGoals().goals[0].saved, 150000);
});

test('wallet check records a difference without changing balances; adjustment changes them once', () => {
  const { context: app, sheets } = backend();
  app.addWallet({ name: 'BRI', opening: 100000, openingDate: '2026-09-01', type: 'Bank' });
  app.addIncome({ date: '2026-09-02', type: 'Gaji', amount: 50000, source: 'BRI' });
  const before = app.getDashboardData(9, 2026);
  assert.equal(before.walletBalances.BRI, 150000);
  assert.equal(before.netWorth.netWorth, 150000);

  const check = app.recordWalletReconciliation({ wallet: 'BRI', actualBalance: 145000,
    notes: 'Biaya admin bank belum jelas' });
  assert.equal(check.success, true);
  assert.equal(check.difference, -5000);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 150000);
  assert.equal(sheets.get('Wallets').rows[1][1], 100000);
  assert.equal(sheets.get('Income').rows.length, 2);

  assert.equal(app.applyWalletAdjustment({ id: check.id }).success, true);
  const after = app.getDashboardData(9, 2026);
  assert.equal(after.walletBalances.BRI, 145000);
  assert.equal(after.netWorth.netWorth, 145000);
  assert.equal(after.summary.totalInc, 50000);
  assert.equal(after.summary.totalExp, 0);
  assert.equal(app.applyWalletAdjustment({ id: check.id }).success, false);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 145000);
  const record = app.listWalletReconciliations().records[0];
  assert.ok(record.appliedAt);
  assert.equal(record.appliedAmount, -5000);
});

test('a newer transaction invalidates an old adjustment; a new check reconciles negative balances', () => {
  const { context: app } = backend();
  app.addWallet({ name: 'Cash', opening: 10000 });
  const stale = app.recordWalletReconciliation({ wallet: 'Cash', actualBalance: 7000 });
  app.addExpense({ date: '2026-09-02', category: 'Makanan', amount: 1000, source: 'Cash' });
  assert.match(app.applyWalletAdjustment({ id: stale.id, notes: 'Selisih tidak diketahui' }).error,
    /berubah sejak pengecekan/);
  const fresh = app.recordWalletReconciliation({ wallet: 'Cash', actualBalance: -2000 });
  assert.equal(fresh.difference, -11000);
  assert.equal(app.applyWalletAdjustment({ id: fresh.id }).success, false);
  assert.equal(app.applyWalletAdjustment({ id: fresh.id, notes: 'Kas fisik minus' }).success, true);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.Cash, -2000);
  assert.equal(app.getDashboardData(9, 2026).netWorth.netWorth, -2000);
});

test('wallet checks accept zero, reject invalid input and retain custom columns', () => {
  const { context: app, sheets } = backend();
  app.initSheets_();
  sheets.get('Wallets').appendRow(['BRI', 0, '', 'Bank', '', '']);
  const log = sheets.get('WalletReconciliations');
  log.rows[0].splice(3, 0, 'Custom');
  assert.equal(app.recordWalletReconciliation({ wallet: 'missing', actualBalance: 0 }).success, false);
  assert.equal(app.recordWalletReconciliation({ wallet: 'BRI', actualBalance: 'nope' }).success, false);
  const check = app.recordWalletReconciliation({ wallet: 'BRI', actualBalance: 0 });
  assert.equal(check.success, true);
  assert.equal(log.rows[1][3], '');
  assert.equal(app.listWalletReconciliations().records[0].difference, 0);
  assert.equal(app.applyWalletAdjustment({ id: check.id }).success, false);
});

test('legacy bills gain stable IDs without losing custom columns; edits follow ID after deletion', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.initSheets_();
  const bills = sheets.get('Bills');
  bills.rows[0].splice(2, 0, 'Custom');
  bills.appendRow(['2026-10-02', 'A', 'keep-a', 100000, '', '', '', '', '']);
  bills.appendRow(['2026-10-03', 'B', 'keep-b', 200000, '', '', '', '', '']);
  const before = app.listBills(10, 2026).bills;
  assert.equal(before.length, 2);
  assert.ok(before[0].id && before[1].id && before[0].id !== before[1].id);
  assert.equal(before[0].paid, false);
  assert.equal(app.listBills(10, 2026).bills[0].id, before[0].id);
  assert.equal(app.deleteBill(null, before[0].id).success, true);
  assert.equal(app.updateBill({ id: before[1].id, name: 'B diperbarui', amount: 250000 }).success, true);
  assert.equal(app.listBills(10, 2026).bills[0].name, 'B diperbarui');
  assert.equal(bills.rows[1][2], 'keep-b');
});

test('unpaid bills across September and October appear once in the seven-day priority window', () => {
  const { context: app } = backend('2026-09-28T12:00:00+07:00');
  assert.equal(app.addBill({ name: 'September', dueDate: '2026-09-30', amount: 100000 }).success, true);
  assert.equal(app.addBill({ name: 'Oktober', dueDate: '2026-10-02', amount: 200000 }).success, true);
  assert.equal(app.addBill({ name: 'Lewat jauh', dueDate: '2026-09-01', amount: 300000 }).success, true);
  const current = app.getDashboardData(9, 2026);
  assert.deepEqual(Array.from(current.manualBills, b => b.name), ['September', 'Oktober']);
  assert.equal(current.calendar.days[29].items[0].name, 'September');
  assert.equal(current.calendar.remainingCount, 1);
  assert.equal(current.calendar.remainingCommitment, 100000);
  assert.deepEqual(Array.from(app.getDashboardData(10, 2026).manualBills), []);
  assert.equal(app.getDashboardData(10, 2026).calendar.days[1].items[0].name, 'Oktober');
});

test('marking paid updates calendar and priorities without changing cashflow or wallet balance', () => {
  const { context: app } = backend('2026-09-28T12:00:00+07:00');
  app.addWallet({ name: 'BRI', opening: 300000, openingDate: '2026-09-01', type: 'Bank' });
  assert.equal(app.addBill({ name: 'PBB', dueDate: '2026-09-30', amount: 200000,
    wallet: 'BRI' }).success, true);
  const before = app.getDashboardData(9, 2026);
  const id = before.manualBills[0].id;
  assert.equal(before.manualBills[0].wallet, 'BRI');
  assert.equal(before.walletBalances.BRI, 300000);
  assert.equal(before.calendar.remainingCommitment, 200000);
  const paid = app.updateBill({ id, paid: true });
  assert.equal(paid.success, true);
  const after = app.getDashboardData(9, 2026);
  assert.equal(after.manualBills[0].paid, true);
  assert.ok(after.manualBills[0].paidAt);
  assert.equal(after.calendar.days[29].items[0].paid, true);
  assert.equal(after.calendar.remainingCount, 0);
  assert.equal(after.summary.totalExp, 0);
  assert.equal(after.walletBalances.BRI, 300000);
  assert.equal(app.updateBill({ id, paid: true }).success, true);
  assert.equal(app.listBills(9, 2026).bills.find(b => b.id === id).paidAt, after.manualBills[0].paidAt);
  assert.equal(app.updateBill({ id, paid: false }).success, true);
  assert.equal(app.getDashboardData(9, 2026).calendar.remainingCommitment, 200000);
});

test('paying a bill records exactly one expense, marks it paid, and editing follows the link', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.addWallet({ name: 'BRI', opening: 500000, openingDate: '2026-09-01', type: 'Bank' });
  app.addBill({ name: 'PBB', dueDate: '2026-10-02', amount: 200000, wallet: 'BRI' });
  const id = app.listBills(10, 2026).bills[0].id;
  const payment = { id, date: '2026-09-28', amount: 180000, wallet: 'BRI',
    category: 'Kewajiban & Utang', subcategory: 'Pajak (PBB/STNK)' };
  assert.equal(app.recordBillPayment(payment).success, true);
  assert.equal(app.recordBillPayment(payment).alreadyRecorded, true);
  const expenses = sheets.get('Expenses');
  assert.equal(expenses.rows.length, 2);
  assert.equal(expenses.rows[1][expenses.rows[0].indexOf('BillId')], id);
  const dashboard = app.getDashboardData(9, 2026);
  assert.equal(dashboard.summary.totalExp, 180000);
  assert.equal(dashboard.walletBalances.BRI, 320000);
  assert.equal(dashboard.manualBills[0].linkedExpense, true);
  assert.equal(dashboard.calendar.remainingCount, 0);
  assert.equal(app.updateBill({ id, paid: false }).success, false);
  assert.equal(app.deleteBill(null, id).success, false);
  const tx = app.listRecentTransactions(9, 2026, 10).transactions.find(t => t.kind === 'expense');
  assert.equal(tx.billId, id);
  assert.equal(app.editTransaction({ sheet: 'expense', rowIndex: tx.rowIndex, billId: id,
    fields: { amount: 190000 } }).success, true);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 310000);
  assert.equal(app.deleteTransaction('expense', tx.rowIndex, id).success, true);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 500000);
  assert.equal(app.listBills(10, 2026).bills[0].paid, false);
  assert.equal(app.deleteBill(null, id).success, true);
});

test('partial payment write is recoverable without duplicating a deduction', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.addWallet({ name: 'BRI', opening: 300000, openingDate: '2026-09-01', type: 'Bank' });
  app.addBill({ name: 'Pajak', dueDate: '2026-09-30', amount: 100000 });
  const id = app.listBills(9, 2026).bills[0].id;
  const billSheet = sheets.get('Bills');
  const originalRange = billSheet.getRange;
  let failOnce = true;
  billSheet.getRange = function (row, col, height, width) {
    const range = originalRange.call(this, row, col, height, width);
    if (failOnce && row === 2 && col === billSheet.rows[0].indexOf('PaidAt') + 1) {
      range.setValue = () => { failOnce = false; throw new Error('write interrupted'); };
    }
    return range;
  };
  const input = { id, date: '2026-09-28', amount: 100000, wallet: 'BRI', category: 'Kewajiban & Utang' };
  assert.throws(() => app.recordBillPayment(input), /write interrupted/);
  assert.equal(app.listBills(9, 2026).bills[0].paid, true);
  assert.equal(app.recordBillPayment(input).alreadyRecorded, true);
  assert.equal(sheets.get('Expenses').rows.length, 2);
  assert.equal(app.getDashboardData(9, 2026).walletBalances.BRI, 200000);
  assert.equal(app.listBills(9, 2026).bills[0].wallet, 'BRI');
});

test('linked expense actions reject a stale row after a deletion', () => {
  const { context: app } = backend('2026-09-28T12:00:00+07:00');
  app.addWallet({ name: 'Cash', opening: 10000, openingDate: '2026-09-01', type: 'Tunai' });
  app.addBill({ name: 'A', dueDate: '2026-09-29', amount: 1000 });
  const id = app.listBills(9, 2026).bills[0].id;
  app.recordBillPayment({ id, date: '2026-09-28', amount: 1000, wallet: 'Cash', category: 'Kewajiban & Utang' });
  app.addExpense({ date: '2026-09-28', amount: 2000, source: 'Cash', category: 'Makanan Pokok & Minuman' });
  assert.equal(app.deleteTransaction('expense', 2, id).success, true);
  assert.equal(app.deleteTransaction('expense', 2, id).success, false);
  assert.equal(app.editTransaction({ sheet: 'expense', rowIndex: 2, billId: id,
    fields: { amount: 3000 } }).success, false);
  assert.equal(app.getDashboardData(9, 2026).summary.totalExp, 2000);
});

test('an existing Paylater expense can allocate principal without recording a second expense', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.addWallet({ name: 'Cash', opening: 3000000, openingDate: '2026-09-01', type: 'Tunai' });
  app.addDebt({ type: 'Kartu Kredit/Paylater', name: 'Paylater', value: 2113576,
    minPayment: 220000, interestRate: 0 });
  const debt = app.getDashboardData(9, 2026).netWorth.debtDetails[0];
  app.addExpense({ date: '2026-09-26', category: 'Kewajiban & Utang',
    subcategory: 'Cicilan Paylater/Pinjol', amount: 220000, source: 'Cash' });
  const before = app.getDashboardData(9, 2026);
  assert.equal(before.netWorth.totalDebts, 2113576);
  const tx = app.listRecentTransactions(9, 2026, 10).transactions[0];
  const linked = app.editTransaction({ sheet: 'expense', rowIndex: tx.rowIndex,
    fields: { debtId: debt.id, principalPaid: 200000 } });
  assert.equal(linked.success, true);
  assert.equal(sheets.get('Expenses').rows.length, 2);
  const after = app.getDashboardData(9, 2026);
  assert.equal(after.netWorth.totalDebts, 1913576);
  assert.equal(after.walletBalances.Cash, 2780000);
  assert.equal(after.summary.totalExp, 220000);
  assert.equal(after.netWorth.netWorth, before.netWorth.netWorth + 200000);
  assert.equal(after.netWorth.debtDetails[0].principalPaid, 200000);
  assert.equal(app.calculateDebtPayoff({ extraPayment: 0 }).totalDebt, 1913576);
  assert.equal(app.deleteWealthItem('debt', debt.rowIndex).success, false);
  assert.equal(app.updateDebt({ id: debt.id, rowIndex: debt.rowIndex, value: 150000 }).success, false);
  assert.equal(app.editTransaction({ sheet: 'expense', rowIndex: tx.rowIndex,
    expectedDebtId: debt.id, fields: { debtId: debt.id, principalPaid: 220000 } }).success, true);
  assert.equal(app.getDashboardData(9, 2026).netWorth.totalDebts, 1893576);
  assert.equal(app.deleteTransaction('expense', tx.rowIndex, '', debt.id).success, true);
  assert.equal(app.getDashboardData(9, 2026).netWorth.totalDebts, 2113576);
  assert.equal(app.deleteWealthItem('debt', debt.rowIndex).success, true);
});

test('debt payment validation rejects unknown debts, overpayment and stale linked rows', () => {
  const { context: app } = backend('2026-09-28T12:00:00+07:00');
  app.addDebt({ type: 'Pinjaman Pribadi', name: 'A', value: 100000 });
  const id = app.getDashboardData(9, 2026).netWorth.debtDetails[0].id;
  const data = { date: '2026-09-28', category: 'Kewajiban & Utang', amount: 20000,
    source: 'Cash', debtId: id, principalPaid: 20000 };
  assert.equal(app.addExpense({ ...data, debtId: 'missing' }).success, false);
  assert.equal(app.addExpense({ ...data, principalPaid: 21000 }).success, false);
  assert.equal(app.addExpense({ ...data }).success, true);
  assert.equal(app.editTransaction({ sheet: 'expense', rowIndex: 2,
    fields: { amount: 10000 } }).success, false);
  assert.equal(app.addExpense({ ...data, amount: 90000, principalPaid: 90000 }).success, false);
  app.addExpense({ date: '2026-09-28', category: 'Lain-lain', amount: 1000, source: 'Cash' });
  assert.equal(app.deleteTransaction('expense', 2, '', id).success, true);
  assert.equal(app.deleteTransaction('expense', 2, '', id).success, false);
  assert.equal(app.getDashboardData(9, 2026).netWorth.totalDebts, 100000);
});

test('legacy debts get IDs after custom columns without changing their balances', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.initSheets_();
  const debts = sheets.get('Debts');
  debts.rows[0].splice(7, 0, 'Custom');
  debts.appendRow(['2026-09-01', 'Lainnya', 'Lama', 150000, '', 0, 0, 'tetap', '']);
  const initial = app.getDashboardData(9, 2026).netWorth.debtDetails[0];
  assert.ok(initial.id);
  assert.equal(initial.value, 150000);
  assert.equal(debts.rows[1][7], 'tetap');
  assert.equal(app.getDashboardData(9, 2026).netWorth.debtDetails[0].id, initial.id);
});

test('a fresh dashboard read bypasses an older cached debt total and matches the detail', () => {
  const { context: app, sheets } = backend('2026-09-28T12:00:00+07:00');
  app.addDebt({ type: 'Kartu Kredit/Paylater', name: 'Paylater', value: 2113576 });
  const query = fresh => app.handleAction_({ postData: { contents: JSON.stringify({
    action: 'getDashboardData', data: { month: 9, year: 2026, fresh }
  }) } });
  assert.equal(query(false).netWorth.totalDebts, 2113576);
  sheets.get('Debts').rows[1][3] = 2013576; // Simulate an external Sheet change while cache lives.
  assert.equal(query(false).netWorth.totalDebts, 2113576);
  const updated = query(true);
  assert.equal(updated.netWorth.totalDebts, 2013576);
  assert.equal(updated.netWorth.debtDetails[0].value, updated.netWorth.totalDebts);
});

test('bill input validation prevents invented dates and unknown wallets', () => {
  const { context: app } = backend('2026-12-29T12:00:00+07:00');
  assert.equal(app.addBill({ name: 'A', dueDate: '2026-02-31', amount: 10 }).success, false);
  assert.equal(app.addBill({ name: 'A', dueDate: '2027-01-02', amount: 0 }).success, false);
  assert.equal(app.addBill({ name: 'A', dueDate: '2027-01-02', amount: 10,
    wallet: 'tidak ada' }).success, false);
  assert.equal(app.addBill({ name: 'Tahun baru', dueDate: '2027-01-02', amount: 15000 }).success, true);
  assert.equal(app.getDashboardData(12, 2026).manualBills[0].name, 'Tahun baru');
  const id = app.listBills(1, 2027).bills[0].id;
  assert.equal(app.updateBill({ id, dueDate: '2027-02-30' }).success, false);
  assert.equal(app.updateBill({ id, paid: 'yes' }).success, false);
  assert.equal(app.updateBill({ id: 'missing', paid: true }).success, false);
});

test('a subscription paid this month can still be due next month; month ends clamp correctly', () => {
  const { context: sep } = backend('2026-09-28T12:00:00+07:00');
  sep.addExpense({ date: '2026-09-01', category: 'Kewajiban & Utang',
    subcategory: 'Internet', amount: 120000, source: 'Cash' });
  const september = sep.getDashboardData(9, 2026);
  assert.equal(september.upcomingBills.length, 1);
  assert.equal(september.upcomingBills[0].nextDate, '2026-10-01');
  assert.equal(september.upcomingBills[0].paidThisMonth, true);
  assert.equal(september.upcomingBills[0].paidForNextDate, false);
  sep.addBill({ name: 'Internet', dueDate: '2026-10-01', amount: 120000 });
  const october = sep.getDashboardData(10, 2026);
  assert.equal(october.calendar.days[0].items.length, 1);
  assert.equal(october.calendar.days[0].total, 120000);
  assert.equal(october.calendar.remainingCommitment, 120000);

  const { context: feb } = backend('2027-02-24T12:00:00+07:00');
  feb.addExpense({ date: '2027-01-31', category: 'Kewajiban & Utang',
    subcategory: 'Internet', amount: 120000, source: 'Cash' });
  const february = feb.getDashboardData(2, 2027);
  assert.equal(february.upcomingBills[0].nextDate, '2027-02-28');
  assert.equal(february.calendar.days[27].items[0].paid, false);
});

test('past net worth is unknown until captured; repeated capture with identical values is idempotent', () => {
  const { context: app, sheets } = backend();
  app.addWallet({ name: 'Cash', opening: 100000 });
  const initial = app.getDashboardData(9, 2026);
  assert.equal(initial.netWorth.netWorth, 100000);
  assert.deepEqual(Array.from(initial.netWorth.netWorthHistory), []);
  const first = app.recordNetWorthSnapshot({ notes: 'Saldo awal diperiksa' });
  assert.equal(first.success, true);
  assert.equal(first.alreadyRecorded, undefined);
  const repeat = app.recordNetWorthSnapshot({ notes: 'Klik kedua' });
  assert.equal(repeat.success, true);
  assert.equal(repeat.alreadyRecorded, true);
  assert.equal(repeat.id, first.id);
  assert.equal(sheets.get('NetWorthSnapshots').rows.length, 2);
  const snapshots = app.listNetWorthSnapshots();
  assert.equal(snapshots.snapshots[0].netWorth, 100000);
  assert.equal(snapshots.snapshots[0].notes, 'Saldo awal diperiksa');
  assert.equal(snapshots.series.length, 1);
  assert.equal(app.getDashboardData(9, 2026).netWorth.netWorthHistory[0].source, 'snapshot');
});

test('new asset and debt values cannot rewrite an older snapshot on the same day', () => {
  const { context: app, sheets } = backend();
  app.addWallet({ name: 'BRI', opening: 100000 });
  app.addAsset({ type: 'Investasi', name: 'Reksa Dana', value: 50000, inst: 'Bank' });
  app.addDebt({ type: 'Cicilan', name: 'Utang', value: 10000, inst: 'Bank' });
  const before = app.recordNetWorthSnapshot({ notes: 'Sebelum perubahan' });
  assert.equal(app.listNetWorthSnapshots().snapshots[0].netWorth, 140000);
  app.addAsset({ type: 'Investasi', name: 'Emas', value: 20000, inst: 'Rumah' });
  app.addDebt({ type: 'Cicilan', name: 'Kredit', value: 5000, inst: 'Bank' });
  const after = app.recordNetWorthSnapshot({ notes: 'Setelah perubahan' });
  assert.notEqual(after.id, before.id);
  const history = app.listNetWorthSnapshots();
  assert.equal(history.snapshots.length, 2);
  assert.equal(history.snapshots[1].netWorth, 140000);
  assert.equal(history.snapshots[0].netWorth, 155000);
  assert.equal(history.series.length, 1); // titik terakhir bulan berjalan
  assert.equal(history.series[0].value, 155000);
  assert.equal(sheets.get('NetWorthSnapshots').rows.length, 3);
});

test('wallet adjustment changes the next snapshot without inventing historic income', () => {
  const { context: app } = backend();
  app.addWallet({ name: 'Cash', opening: 100000 });
  app.recordNetWorthSnapshot({});
  const check = app.recordWalletReconciliation({
    wallet: 'Cash', actualBalance: 95000, notes: 'Selisih kas'
  });
  assert.equal(app.applyWalletAdjustment({ id: check.id }).success, true);
  app.recordNetWorthSnapshot({});
  const history = app.listNetWorthSnapshots().snapshots;
  assert.equal(history[0].netWorth, 95000);
  assert.equal(history[1].netWorth, 100000);
  assert.equal(app.getDashboardData(9, 2026).summary.totalInc, 0);
  assert.equal(app.getDashboardData(9, 2026).summary.totalExp, 0);
});

test('a missing month is an explicit gap rather than an invented net worth', () => {
  const { context: app } = backend();
  const series = app.netWorthSnapshotSeries_([
    { date: '2026-01-31', netWorth: 150000 },
    { date: '2026-03-10', netWorth: 250000 }
  ]);
  assert.deepEqual(Array.from(series, p => p.source), ['snapshot', 'missing', 'snapshot']);
  assert.deepEqual(Array.from(series, p => p.value), [150000, null, 250000]);
  assert.equal(series[1].label, 'Feb 2026');
});
