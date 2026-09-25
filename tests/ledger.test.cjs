const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend() {
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
