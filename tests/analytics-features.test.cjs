const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setupBackend(fixedNow = '2026-11-21T12:00:00Z') {
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

  const ss = {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) {
      const sheet = new Sheet();
      sheets.set(name, sheet);
      return sheet;
    }
  };

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet() { return ss; }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(k) { return cache.get(k) ?? null; },
          put(k, v) { cache.set(k, v); },
          remove(k) { cache.delete(k); }
        };
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty(k) { return properties.get(k) ?? null; },
        setProperty(k, v) { properties.set(k, String(v)); },
        deleteProperty(k) { properties.delete(k); }
      }),
      getDocumentProperties: () => ({
        getProperty(k) { return properties.get(k) ?? null; },
        setProperty(k, v) { properties.set(k, String(v)); },
        deleteProperty(k) { properties.delete(k); }
      })
    },
    Session: {
      getScriptTimeZone() { return 'Asia/Jakarta'; }
    },
    Utilities: {
      formatDate(d, tz, pattern) {
        const iso = d.toISOString();
        if (pattern === 'yyyy-MM-dd') return iso.slice(0, 10);
        return iso;
      },
      getUuid() { return `uuid-${++nextId}`; }
    },
    Date: class extends Date {
      constructor(...args) {
        if (!args.length) super(fixedNow);
        else super(...args);
      }
    },
    console
  };

  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { sandbox, ss };
}

test('getDashboardData returns daily, pDaily, dailyByCategory, and incomeSources for spending & cashflow', () => {
  const { sandbox, ss } = setupBackend('2026-11-21T12:00:00Z');

  // Trigger initSheets so sheets exist
  sandbox.getDashboardData(11, 2026, { fresh: true });

  // Income sheet: Date, Type, Amount, Notes, Source
  const incSheet = ss.getSheetByName('Income');
  incSheet.rows = [
    ['Date', 'Type', 'Amount', 'Notes', 'Source'],
    ['2026-11-01', 'Gaji / Salary', 10000000, 'Gaji pokok', 'BCA'],
    ['2026-11-10', 'Freelance', 3000000, 'Project web', 'Mandiri'],
    ['2026-10-01', 'Gaji / Salary', 10000000, 'Gaji Oktober', 'BCA']
  ];

  // Expense sheet: Date, Category, Subcategory, Amount, Notes, Source
  const expSheet = ss.getSheetByName('Expenses');
  expSheet.rows = [
    ['Date', 'Category', 'Subcategory', 'Amount', 'Notes', 'Source'],
    ['2026-11-02', 'Makanan & Minuman', 'Makan Siang', 50000, 'Resto', 'BCA'],
    ['2026-11-05', 'Transportasi', 'Bensin', 100000, 'Pertamina', 'Cash'],
    ['2026-11-15', 'Makanan & Minuman', 'Groceries', 350000, 'Supermarket', 'BCA'],
    ['2026-10-02', 'Makanan & Minuman', 'Makan Siang', 40000, 'Resto', 'BCA'],
    ['2026-10-15', 'Transportasi', 'Bensin', 120000, 'Pertamina', 'Cash']
  ];

  // Saving sheet
  const savSheet = ss.getSheetByName('Savings');
  savSheet.rows = [
    ['Date', 'Type', 'Amount', 'Notes', 'Source', 'Destination'],
    ['2026-11-03', 'Dana Darurat', 2000000, 'Tabungan darurat', 'BCA', 'Bibit']
  ];

  const dash = sandbox.getDashboardData(11, 2026, { fresh: true });
  assert.equal(dash.success, true);

  // Check summary
  assert.equal(dash.summary.totalInc, 13000000);
  assert.equal(dash.summary.totalExp, 500000);
  assert.equal(dash.summary.totalSav, 2000000);
  assert.equal(dash.summary.balance, 10500000);

  // Check daily and pDaily
  assert.ok(Array.isArray(dash.daily), 'daily should be an array');
  assert.ok(Array.isArray(dash.pDaily), 'pDaily should be an array');
  assert.equal(dash.daily[1], 50000); // 2 Nov
  assert.equal(dash.daily[4], 100000); // 5 Nov
  assert.equal(dash.daily[14], 350000); // 15 Nov

  assert.equal(dash.pDaily[1], 40000); // 2 Oct
  assert.equal(dash.pDaily[14], 120000); // 15 Oct

  // Check dailyByCategory
  assert.ok(dash.dailyByCategory['Makanan & Minuman']);
  assert.equal(dash.dailyByCategory['Makanan & Minuman'][1], 50000);
  assert.equal(dash.dailyByCategory['Makanan & Minuman'][14], 350000);

  // Check incomeSources
  assert.equal(dash.incomeSources['Gaji / Salary'], 10000000);
  assert.equal(dash.incomeSources['Freelance'], 3000000);
});

test('cumulative spending series accurately aggregates daily values', () => {
  const daily = [10000, 25000, 0, 50000];
  let cumulative = 0;
  const series = daily.map((amt, idx) => {
    cumulative += amt;
    return { day: idx + 1, value: cumulative };
  });

  assert.deepEqual(series, [
    { day: 1, value: 10000 },
    { day: 2, value: 35000 },
    { day: 3, value: 35000 },
    { day: 4, value: 85000 }
  ]);
});

test('six months money flow contains balanced metrics without NaN', () => {
  const { sandbox } = setupBackend('2026-11-21T12:00:00Z');
  const dash = sandbox.getDashboardData(11, 2026, { fresh: true });

  assert.ok(Array.isArray(dash.sixMonths));
  assert.equal(dash.sixMonths.length, 6);
  dash.sixMonths.forEach((m) => {
    assert.equal(typeof m.income, 'number');
    assert.equal(typeof m.expenses, 'number');
    assert.equal(typeof m.balance, 'number');
    assert.ok(!isNaN(m.income));
    assert.ok(!isNaN(m.expenses));
  });
});
