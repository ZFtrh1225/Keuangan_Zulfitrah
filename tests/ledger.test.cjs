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
    ['Date', 'Type', 'Amount', 'Notes', 'Source', 'Destination']);
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
