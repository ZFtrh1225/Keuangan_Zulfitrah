/**
 * ════════════════════════════════════════════════════════════════════
 *  MONEY TRACKER PRO — Backend (Google Apps Script) v2.0
 *  Pasang di Google Sheets → Extensions → Apps Script
 *  Replace seluruh isi Code.gs lalu Deploy → Manage deployments → New version
 *
 *  PENTING: Setelah replace, ganti GEMINI_API_KEY di Script Properties
 *  (File → Project Settings → Script Properties → Add: GEMINI_API_KEY)
 *  Jangan hardcode di sini lagi!
 * ════════════════════════════════════════════════════════════════════
 */

// ─── Konstanta Global ───────────────────────────────────────────────
const SHEET_NAMES = {
  INCOME: 'Income',
  EXPENSE: 'Expenses',
  SAVING: 'Savings',
  ASSET: 'Assets',
  DEBT: 'Debts',
  GOAL: 'Goals',
  TEMPLATE: 'Templates',
  BILL: 'Bills'
};

// Milestone hari berturut-turut (streak) untuk badge motivasi
const STREAK_BADGES = [7, 14, 30, 60, 90, 180, 365];

/**
 * SINGLE SOURCE OF TRUTH untuk seluruh daftar kategori pengeluaran.
 * Frontend memanggil getCategories() lalu render dropdown otomatis.
 *
 * Cara menambah kategori baru:
 *   1. Tambah object baru di array di bawah dengan name, type, icon, subcategories.
 *   2. type wajib salah satu: 'needs' | 'wants' | 'invest'
 *      (invest = menabung/investasi — biasanya dicatat lewat tab Tabungan,
 *       jarang dipakai untuk expense, tapi tersedia bila perlu).
 *   3. Re-deploy. Selesai. Frontend & backend langsung sinkron.
 */
const CATEGORIES = [
  // ── NEEDS (Kebutuhan) ──
  { name: 'Makanan Pokok & Minuman', type: 'needs', icon: '🛒',
    subcategories: ['Belanja Supermarket/Pasar', 'Sembako & Beras', 'Lauk Pauk/Warteg', 'Sayur & Buah', 'Air Galon & Gas LPG', 'Lainnya'] },
  { name: 'Transportasi', type: 'needs', icon: '🚗',
    subcategories: ['Bensin/BBM', 'Ojek/Taksi Online', 'Angkutan Umum/KRL', 'Parkir & Tol', 'Servis & Cuci Kendaraan', 'Lainnya'] },
  { name: 'Rumah & Utilitas', type: 'needs', icon: '🏠',
    subcategories: ['Sewa Kos/Kontrakan', 'Listrik (PLN)', 'Air (PDAM)', 'Internet/WiFi', 'Pulsa & Paket Data', 'Iuran Keamanan/Sampah', 'Keperluan Mandi/Cuci', 'Lainnya'] },
  { name: 'Kesehatan & Proteksi', type: 'needs', icon: '🏥',
    subcategories: ['Obat & Apotek', 'Dokter/Klinik/RS', 'Vitamin & Suplemen', 'BPJS Kesehatan', 'Asuransi (Kesehatan/Jiwa)', 'Alat Kesehatan', 'Lainnya'] },
  { name: 'Kewajiban & Utang', type: 'needs', icon: '💳',
    subcategories: ['Cicilan Paylater/Pinjol', 'Tagihan Kartu Kredit', 'Cicilan KPR', 'Cicilan Kendaraan', 'Pajak (PBB/STNK)', 'Biaya Admin/Bank', 'Lainnya'] },
  { name: 'Pendidikan', type: 'needs', icon: '🎓',
    subcategories: ['SPP/UKT/Uang Kuliah', 'Buku & Jurnal Kuliah', 'Kursus/Sertifikasi', 'Alat Tulis/Software', 'Pelatihan/Workshop', 'Lainnya'] },
  { name: 'Keluarga & Tanggungan', type: 'needs', icon: '👨‍👩‍👧',
    subcategories: ['Uang Orang Tua', 'Kebutuhan Adik/Anak', 'Asisten Rumah Tangga', 'Lainnya'] },
  { name: 'Kantor', type: 'needs', icon: '🏢',
    subcategories: ['Rokok', 'Makanan/Minuman', 'Lainnya'] },

  // ── WANTS (Keinginan) ──
  { name: 'Makan di Luar & Jajanan', type: 'wants', icon: '🍔',
    subcategories: ['Cafe & Kopi', 'Restoran/Fast Food', 'GoFood/GrabFood', 'Snack & Jajanan', 'Lainnya'] },
  { name: 'Hiburan & Streaming', type: 'wants', icon: '🎬',
    subcategories: ['Netflix/Disney/Prime', 'Spotify/Apple Music', 'Bioskop/Konser', 'Game Online/Top Up', 'Buku Fiksi/Komik', 'Lainnya'] },
  { name: 'Belanja Online & Fashion', type: 'wants', icon: '🛍️',
    subcategories: ['Pakaian & Baju', 'Sepatu & Tas', 'Aksesoris/Perhiasan', 'Elektronik & Gadget', 'Perabot & Dekorasi Kamar', 'Lainnya'] },
  { name: 'Hobi & Olahraga', type: 'wants', icon: '🏋️',
    subcategories: ['Gym/Sewa Lapangan', 'Peralatan Olahraga', 'Komunitas Hobi', 'Merchandise/Koleksi', 'Lainnya'] },
  { name: 'Traveling & Wisata', type: 'wants', icon: '✈️',
    subcategories: ['Tiket Pesawat/Kereta', 'Hotel/Penginapan', 'Tiket Wisata/Wahana', 'Oleh-oleh', 'Paspor/Visa', 'Lainnya'] },
  { name: 'Perawatan & Kecantikan', type: 'wants', icon: '💄',
    subcategories: ['Skincare & Bodycare', 'Makeup & Kosmetik', 'Salon & Barbershop', 'Spa & Pijat', 'Parfum', 'Lainnya'] },
  { name: 'Sosial, Amal & Hadiah', type: 'wants', icon: '🎁',
    subcategories: ['Sedekah/Infaq', 'Zakat', 'Hadiah/Kado Teman', 'Traktir Teman/Pacar', 'Sumbangan Pernikahan', 'Lainnya'] },
  { name: 'Lain-lain', type: 'wants', icon: '🔖',
    subcategories: ['Tak Terduga', 'Uang Hilang/Kecurian', 'Lainnya'] }
];

/** Lookup map kategori → tipe (needs/wants/invest). Diturunkan otomatis dari CATEGORIES. */
const CATEGORY_TYPES = (function () {
  const out = {};
  CATEGORIES.forEach(c => { out[c.name] = c.type; });
  return out;
})();

// Aset yang dianggap "likuid" untuk perhitungan dana darurat & runway
const LIQUID_ASSET_TYPES = ['Kas/Bank/E-Wallet'];
const INVESTMENT_ASSET_TYPES = ['Investasi (Saham/Forex/Emas)'];

const RECURRING_KEYWORDS = [
  'Netflix', 'Spotify', 'Disney', 'Youtube', 'HBO', 'Vidio', 'Iflix',
  'Sewa', 'Cicilan', 'Paylater', 'Internet', 'WiFi', 'Kos', 'Indihome',
  'BPJS', 'Asuransi', 'PLN', 'PDAM', 'Listrik', 'Gym', 'Tagihan'
];

const CACHE_TTL_SECONDS = 60; // 1 menit (Apps Script max 21600s = 6 jam)

// ════════════════════════════════════════════════════════════════════
//  Entry Points
// ════════════════════════════════════════════════════════════════════

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Money Tracker Pro')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const result = handleAction_(e);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction_(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return { success: false, error: 'Invalid JSON: ' + err.message };
  }

  const action = body.action;
  const data = body.data || {};

  try {
    switch (action) {
      // ── Read ──
      case 'getDashboardData':       return getDashboardData(data.month, data.year);
      case 'listRecentTransactions': return listRecentTransactions(data.month, data.year, data.limit);
      case 'listGoals':              return listGoals();
      case 'getSettings':            return getSettings();
      case 'getCategories':          return getCategories();
      case 'listTemplates':          return listTemplates();
      case 'listBills':              return listBills(data.month, data.year);
      // ── Create ──
      case 'addIncome':              return addIncome(data);
      case 'addExpense':              return addExpense(data);
      case 'addSaving':              return addSaving(data);
      case 'addAsset':               return addAsset(data);
      case 'addDebt':                return addDebt(data);
      case 'addGoal':                return addGoal(data);
      case 'addGoalDeposit':         return addGoalDeposit(data);
      case 'addTemplate':            return addTemplate(data);
      case 'addBill':                return addBill(data);
      // ── Update ──
      case 'editTransaction':        return editTransaction(data);
      case 'updateGoal':             return updateGoal(data);
      case 'saveSettings':           return saveSettings(data);
      // ── Delete ──
      case 'deleteTransaction':      return deleteTransaction(data.sheet, data.rowIndex);
      case 'deleteWealthItem':       return deleteWealthItem(data.type, data.rowIndex);
      case 'deleteGoal':             return deleteGoal(data.rowIndex);
      case 'deleteTemplate':         return deleteTemplate(data.rowIndex);
      case 'deleteBill':             return deleteBill(data.rowIndex);
      // ── Special ──
      case 'generatePDFReport':      return generatePDFReport(data.month, data.year);
      case 'getGeminiDeepAnalysis':  return getGeminiDeepAnalysis(data);
      default:
        return { success: false, error: 'Action tidak dikenal: ' + action };
    }
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
}

// ════════════════════════════════════════════════════════════════════
//  Sheet Init
// ════════════════════════════════════════════════════════════════════

function initSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = [
    { name: SHEET_NAMES.INCOME,  headers: ['Date', 'Type', 'Amount', 'Notes', 'Source'] },
    { name: SHEET_NAMES.EXPENSE, headers: ['Date', 'Category', 'Subcategory', 'Amount', 'Notes', 'Source'] },
    { name: SHEET_NAMES.SAVING,  headers: ['Date', 'Type', 'Amount', 'Notes', 'Source'] },
    { name: SHEET_NAMES.ASSET,   headers: ['Date', 'Type', 'Name', 'Value', 'Institution'] },
    { name: SHEET_NAMES.DEBT,    headers: ['Date', 'Type', 'Name', 'Value', 'Institution'] },
    { name: SHEET_NAMES.GOAL,    headers: ['Date', 'Name', 'Target', 'Saved', 'Deadline', 'Category', 'Notes'] },
    // Template transaksi cepat — user simpan transaksi yg sering muncul
    // Kind: 'income' | 'expense' | 'saving'. Untuk expense, pakai Category+Subcategory.
    // Untuk income/saving, pakai TypeText (di kolom Category) — Subcategory kosong.
    { name: SHEET_NAMES.TEMPLATE, headers: ['Name', 'Kind', 'Category', 'Subcategory', 'Amount', 'Source', 'Notes', 'CreatedAt'] },
    // Tagihan/cicilan manual non-recurring (PBB, premi tahunan, dll)
    { name: SHEET_NAMES.BILL,    headers: ['DueDate', 'Name', 'Amount', 'Notes', 'CreatedAt'] }
  ];
  cfg.forEach(c => {
    let sh = ss.getSheetByName(c.name);
    if (!sh) {
      sh = ss.insertSheet(c.name);
      sh.getRange(1, 1, 1, c.headers.length)
        .setValues([c.headers])
        .setFontWeight('bold')
        .setBackground('#0f1623')
        .setFontColor('#00e5b4');
      sh.setFrozenRows(1);
    }
  });
}

// ════════════════════════════════════════════════════════════════════
//  CRUD — Transactions
// ════════════════════════════════════════════════════════════════════

function addIncome(data) {
  initSheets_();
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.INCOME)
    .appendRow([data.date, data.type, Number(data.amount), data.notes || '', data.source]);
  invalidateCache_();
  return { success: true, msg: 'Pemasukan berhasil ditambahkan! 🎉' };
}

function addExpense(data) {
  initSheets_();
  // Tolak pengeluaran tanpa kategori — mencegah baris "kategori kosong"
  // yang nantinya muncul sebagai kategori 'undefined' di analisis.
  const cat = (data.category == null ? '' : String(data.category)).trim();
  if (!cat || cat.toLowerCase() === 'undefined' || cat.toLowerCase() === 'null') {
    return { success: false, error: 'Kategori wajib diisi.' };
  }
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.EXPENSE)
    .appendRow([data.date, cat, data.subcategory || '', Number(data.amount), data.notes || '', data.source]);
  invalidateCache_();
  return { success: true, msg: 'Pengeluaran berhasil dicatat! ✅' };
}

function addSaving(data) {
  initSheets_();
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.SAVING)
    .appendRow([data.date, data.type, Number(data.amount), data.notes || '', data.source]);
  invalidateCache_();
  return { success: true, msg: 'Tabungan berhasil disimpan! 💰' };
}

function addAsset(data) {
  initSheets_();
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.ASSET)
    .appendRow([new Date(), data.type, data.name, Number(data.value), data.inst]);
  invalidateCache_();
  return { success: true, msg: 'Aset berhasil dicatat! 💎' };
}

function addDebt(data) {
  initSheets_();
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.DEBT)
    .appendRow([new Date(), data.type, data.name, Number(data.value), data.inst]);
  invalidateCache_();
  return { success: true, msg: 'Kewajiban berhasil dicatat! 📝' };
}

/**
 * Edit single transaction row.
 * data: { sheet: 'income'|'expense'|'saving', rowIndex, fields: { date, amount, ... } }
 */
function editTransaction(data) {
  const sheetName = sheetForKind_(data.sheet);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + sheetName);

  const row = parseInt(data.rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const f = data.fields || {};

  // Mapping field name → header column index
  const map = {
    date: 'Date', amount: 'Amount', notes: 'Notes', source: 'Source',
    type: 'Type', category: 'Category', subcategory: 'Subcategory'
  };
  Object.keys(f).forEach(k => {
    const colName = map[k];
    if (!colName) return;
    const idx = headers.indexOf(colName);
    if (idx === -1) return;
    let val = f[k];
    if (k === 'amount') val = Number(val);
    sh.getRange(row, idx + 1).setValue(val);
  });

  invalidateCache_();
  return { success: true, msg: 'Transaksi berhasil diperbarui ✏️' };
}

/**
 * Delete single transaction row.
 * sheet: 'income' | 'expense' | 'saving'
 */
function deleteTransaction(sheet, rowIndex) {
  const sheetName = sheetForKind_(sheet);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  const row = parseInt(rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');
  sh.deleteRow(row);
  invalidateCache_();
  return { success: true, msg: 'Transaksi berhasil dihapus 🗑️' };
}

function sheetForKind_(kind) {
  const m = {
    income: SHEET_NAMES.INCOME,
    expense: SHEET_NAMES.EXPENSE,
    saving: SHEET_NAMES.SAVING
  };
  return m[String(kind).toLowerCase()];
}

function deleteWealthItem(type, rowIndex) {
  const sheetName = type === 'asset' ? SHEET_NAMES.ASSET : SHEET_NAMES.DEBT;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet tidak ditemukan');
  sh.deleteRow(parseInt(rowIndex, 10));
  invalidateCache_();
  return { success: true, msg: 'Data berhasil dihapus 🗑️' };
}

// ════════════════════════════════════════════════════════════════════
//  CRUD — Goals (Tujuan Finansial)
// ════════════════════════════════════════════════════════════════════

function listGoals() {
  initSheets_();
  const rows = getSheetData_(SHEET_NAMES.GOAL);
  const items = rows.map((r, i) => ({
    rowIndex: i + 2,
    date: toIso_(r[0]),
    name: r[1] || '',
    target: parseFloat(r[2]) || 0,
    saved: parseFloat(r[3]) || 0,
    deadline: toIso_(r[4]),
    category: r[5] || 'Umum',
    notes: r[6] || ''
  }));
  return { success: true, goals: items };
}

function addGoal(data) {
  initSheets_();
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.GOAL)
    .appendRow([
      new Date(),
      data.name || 'Tujuan Baru',
      Number(data.target) || 0,
      Number(data.saved) || 0,
      data.deadline || '',
      data.category || 'Umum',
      data.notes || ''
    ]);
  return { success: true, msg: 'Tujuan keuangan berhasil ditambahkan! 🎯' };
}

function updateGoal(data) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOAL);
  if (!sh) throw new Error('Sheet Goals tidak ditemukan');
  const row = parseInt(data.rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');
  const cur = sh.getRange(row, 1, 1, 7).getValues()[0];
  sh.getRange(row, 1, 1, 7).setValues([[
    cur[0],
    data.name !== undefined ? data.name : cur[1],
    data.target !== undefined ? Number(data.target) : cur[2],
    data.saved !== undefined ? Number(data.saved) : cur[3],
    data.deadline !== undefined ? data.deadline : cur[4],
    data.category !== undefined ? data.category : cur[5],
    data.notes !== undefined ? data.notes : cur[6]
  ]]);
  return { success: true, msg: 'Tujuan diperbarui ✏️' };
}

function deleteGoal(rowIndex) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOAL);
  if (!sh) throw new Error('Sheet Goals tidak ditemukan');
  sh.deleteRow(parseInt(rowIndex, 10));
  return { success: true, msg: 'Tujuan dihapus 🗑️' };
}

/**
 * Tambah setoran ke tujuan tertentu (atomic increment).
 * Lebih aman daripada updateGoal({saved:newTotal}) karena tidak ada race read-modify-write
 * antara dua tab/perangkat yang menyetor ke goal sama.
 */
function addGoalDeposit(data) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GOAL);
  if (!sh) throw new Error('Sheet Goals tidak ditemukan');
  const row = parseInt(data.rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');
  const amount = Number(data.amount) || 0;
  if (amount <= 0) throw new Error('Nominal setoran harus lebih dari 0');

  // kolom 4 = Saved
  const cell = sh.getRange(row, 4);
  const cur = parseFloat(cell.getValue()) || 0;
  const newSaved = cur + amount;
  cell.setValue(newSaved);

  return {
    success: true,
    msg: 'Setoran ' + fmtRp_(amount) + ' tercatat 💰',
    newSaved: newSaved
  };
}

// ════════════════════════════════════════════════════════════════════
//  CRUD — Templates (Quick Templates Transaksi Cepat)
// ════════════════════════════════════════════════════════════════════

/**
 * Daftar template transaksi cepat.
 * Auto-suggest tambahan: kalau sheet Templates kosong, ambil 3 transaksi
 * pengeluaran paling sering muncul (sub+notes) dari Expenses sebagai
 * suggestion non-persisted (rowIndex=null) supaya user bisa simpan langsung.
 */
function listTemplates() {
  initSheets_();
  const rows = getSheetData_(SHEET_NAMES.TEMPLATE);
  const items = rows.map((r, i) => ({
    rowIndex: i + 2,
    name: r[0] || '',
    kind: r[1] || 'expense',
    category: r[2] || '',
    subcategory: r[3] || '',
    amount: parseFloat(r[4]) || 0,
    source: r[5] || '',
    notes: r[6] || '',
    isSuggestion: false
  })).filter(t => t.name);

  // Auto-suggest dari pola pengeluaran sering jika user belum punya template
  let suggestions = [];
  if (items.length < 3) {
    const exp = getSheetData_(SHEET_NAMES.EXPENSE);
    const freq = {};
    exp.forEach(r => {
      const sub = r[2] || r[1] || '';
      const note = r[4] ? String(r[4]).trim() : '';
      const src = r[5] || 'Cash';
      const amt = parseFloat(r[3]) || 0;
      if (!sub || amt <= 0) return;
      const key = (sub + '|' + note + '|' + src).toLowerCase();
      if (!freq[key]) {
        freq[key] = {
          count: 0, totalAmt: 0,
          name: (note || sub),
          category: r[1] || '',
          subcategory: sub,
          source: src,
          notes: note
        };
      }
      freq[key].count++;
      freq[key].totalAmt += amt;
    });
    suggestions = Object.values(freq)
      .filter(g => g.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(g => ({
        rowIndex: null,
        name: g.name,
        kind: 'expense',
        category: g.category,
        subcategory: g.subcategory,
        amount: Math.round(g.totalAmt / g.count),
        source: g.source,
        notes: g.notes,
        isSuggestion: true,
        usageCount: g.count
      }));
  }

  return { success: true, templates: items, suggestions: suggestions };
}

function addTemplate(data) {
  initSheets_();
  const name = String(data.name || '').trim();
  if (!name) return { success: false, error: 'Nama template wajib diisi.' };
  const kind = ['income', 'expense', 'saving'].indexOf(String(data.kind || '').toLowerCase()) !== -1
    ? String(data.kind).toLowerCase() : 'expense';
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.TEMPLATE)
    .appendRow([
      name,
      kind,
      data.category || '',
      data.subcategory || '',
      Number(data.amount) || 0,
      data.source || '',
      data.notes || '',
      new Date()
    ]);
  return { success: true, msg: 'Template "' + name + '" tersimpan ⚡' };
}

function deleteTemplate(rowIndex) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEMPLATE);
  if (!sh) throw new Error('Sheet Templates tidak ditemukan');
  const row = parseInt(rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');
  sh.deleteRow(row);
  return { success: true, msg: 'Template dihapus 🗑️' };
}

// ════════════════════════════════════════════════════════════════════
//  CRUD — Manual Bills (tagihan non-recurring untuk Bill Calendar)
// ════════════════════════════════════════════════════════════════════

/**
 * Daftar tagihan manual untuk bulan tertentu (atau seluruhnya kalau month=0).
 */
function listBills(month, year) {
  initSheets_();
  const rows = getSheetDataWithRowIndex_(SHEET_NAMES.BILL);
  let items = rows.map(({ row, rowIndex }) => ({
    rowIndex: rowIndex,
    dueDate: toIso_(row[0]),
    name: row[1] || '',
    amount: parseFloat(row[2]) || 0,
    notes: row[3] || ''
  })).filter(b => b.dueDate && b.name);

  if (month && year) {
    const m = parseInt(month, 10), y = parseInt(year, 10);
    items = items.filter(b => {
      const d = new Date(b.dueDate);
      return !isNaN(d) && d.getFullYear() === y && (d.getMonth() + 1) === m;
    });
  }

  items.sort((a, b) => a.dueDate < b.dueDate ? -1 : 1);
  return { success: true, bills: items };
}

function addBill(data) {
  initSheets_();
  const name = String(data.name || '').trim();
  const date = data.dueDate || data.date;
  if (!name || !date) return { success: false, error: 'Nama & tanggal jatuh tempo wajib diisi.' };
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_NAMES.BILL)
    .appendRow([
      date,
      name,
      Number(data.amount) || 0,
      data.notes || '',
      new Date()
    ]);
  invalidateCache_();
  return { success: true, msg: 'Tagihan "' + name + '" ditambahkan 📅' };
}

function deleteBill(rowIndex) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BILL);
  if (!sh) throw new Error('Sheet Bills tidak ditemukan');
  const row = parseInt(rowIndex, 10);
  if (!row || row < 2) throw new Error('Index baris tidak valid');
  sh.deleteRow(row);
  invalidateCache_();
  return { success: true, msg: 'Tagihan dihapus 🗑️' };
}

// ════════════════════════════════════════════════════════════════════
//  Categories endpoint (single source of truth)
// ════════════════════════════════════════════════════════════════════

/**
 * Kembalikan daftar kategori lengkap untuk frontend.
 * Frontend memanggil ini sekali saat init untuk render dropdown.
 */
function getCategories() {
  return {
    success: true,
    categories: CATEGORIES.map(c => ({
      name: c.name,
      type: c.type,
      icon: c.icon || '',
      subcategories: c.subcategories || []
    }))
  };
}

// ════════════════════════════════════════════════════════════════════
//  Settings (Preferensi User)
// ════════════════════════════════════════════════════════════════════

function getSettings() {
  const props = PropertiesService.getDocumentProperties();
  // categoryBudgets = { "Makan di Luar & Jajanan": 600000, "Hiburan & Streaming": 200000, ... }
  let catBudgets = {};
  try {
    catBudgets = JSON.parse(props.getProperty('categoryBudgets') || '{}') || {};
  } catch (e) { catBudgets = {}; }
  return {
    success: true,
    settings: {
      budgetRule: props.getProperty('budgetRule') || '50/30/20',
      customBudget: JSON.parse(props.getProperty('customBudget') || '{"needs":50,"wants":30,"invest":20}'),
      monthlyEmergencyTarget: parseFloat(props.getProperty('monthlyEmergencyTarget')) || 6,
      categoryBudgets: catBudgets
    }
  };
}

function saveSettings(data) {
  const props = PropertiesService.getDocumentProperties();
  if (data.budgetRule) props.setProperty('budgetRule', data.budgetRule);
  if (data.customBudget) props.setProperty('customBudget', JSON.stringify(data.customBudget));
  if (data.monthlyEmergencyTarget != null) props.setProperty('monthlyEmergencyTarget', String(data.monthlyEmergencyTarget));
  if (data.categoryBudgets && typeof data.categoryBudgets === 'object') {
    // Sanitize: hanya simpan number > 0; kategori dengan nilai 0/null dihapus
    const clean = {};
    Object.keys(data.categoryBudgets).forEach(k => {
      const v = Number(data.categoryBudgets[k]);
      if (v > 0) clean[k] = v;
    });
    props.setProperty('categoryBudgets', JSON.stringify(clean));
  }
  invalidateCache_();
  return { success: true, msg: 'Preferensi tersimpan ⚙️' };
}

function getActiveBudgetSplit_() {
  const s = getSettings().settings;
  if (s.budgetRule === 'Custom') {
    const c = s.customBudget;
    return { needs: c.needs / 100, wants: c.wants / 100, invest: c.invest / 100, label: 'Custom' };
  }
  if (s.budgetRule === '70/20/10') {
    return { needs: 0.7, wants: 0.2, invest: 0.1, label: '70/20/10' };
  }
  return { needs: 0.5, wants: 0.3, invest: 0.2, label: '50/30/20' };
}

/**
 * Ambil plafon per-kategori dari DocumentProperties.
 * Returns: { 'Hiburan & Streaming': 200000, 'Makan di Luar & Jajanan': 600000, ... }
 */
function getCategoryBudgets_() {
  try {
    const props = PropertiesService.getDocumentProperties();
    return JSON.parse(props.getProperty('categoryBudgets') || '{}') || {};
  } catch (e) { return {}; }
}

/**
 * Hitung streak hari berturut-turut user mencatat ≥1 transaksi (income/expense/saving).
 * Returns: { current, longest, lastActivity, milestone }.
 *   current   = jumlah hari berturut-turut sampai HARI INI atau KEMARIN.
 *               Kalau hari ini & kemarin sama-sama tidak ada catatan → 0.
 *   longest   = streak terpanjang yang pernah dicatat.
 *   milestone = badge tertinggi yang sudah dicapai current streak (7/14/30/...).
 */
function computeStreak_(allInc, allExp, allSav) {
  const dayKey = (d) => Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const set = {};
  [allInc, allExp, allSav].forEach(rows => {
    rows.forEach(r => {
      if (!r[0]) return;
      const d = new Date(r[0]);
      if (isNaN(d)) return;
      set[dayKey(d)] = true;
    });
  });
  const days = Object.keys(set).sort(); // ascending
  if (!days.length) {
    return { current: 0, longest: 0, lastActivity: '', milestone: 0 };
  }

  // Hitung longest streak overall
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = Math.round((cur - prev) / 86400000);
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else { run = 1; }
  }

  // Hitung current streak — terhitung kalau aktivitas terakhir == hari ini atau kemarin
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = new Date(days[days.length - 1]);
  lastDate.setHours(0, 0, 0, 0);
  const gap = Math.round((today - lastDate) / 86400000);

  let current = 0;
  if (gap <= 1) {
    // walk back dari last day selama selisih == 1
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const a = new Date(days[i]);
      const b = new Date(days[i + 1]);
      const d = Math.round((b - a) / 86400000);
      if (d === 1) current++;
      else break;
    }
  }

  // Tentukan badge milestone tertinggi yang sudah dicapai
  let milestone = 0;
  for (let i = 0; i < STREAK_BADGES.length; i++) {
    if (current >= STREAK_BADGES[i]) milestone = STREAK_BADGES[i];
  }

  return {
    current: current,
    longest: longest,
    lastActivity: days[days.length - 1],
    milestone: milestone,
    nextMilestone: STREAK_BADGES.find(m => m > current) || null
  };
}

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════

function getSheetData_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function getSheetDataWithRowIndex_(name) {
  const rows = getSheetData_(name);
  return rows.map((r, i) => ({ row: r, rowIndex: i + 2 }));
}

function filterByMonth_(rows, y, m, col) {
  return rows.filter(r => {
    if (!r[col]) return false;
    const d = new Date(r[col]);
    return !isNaN(d) && d.getFullYear() === y && (d.getMonth() + 1) === m;
  });
}

function sum_(rows, col) {
  return rows.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0);
}

function pctChange_(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return (cur - prev) / prev * 100;
}

function fmtRp_(n) {
  return 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
}

function toIso_(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function uniqueMonthsCount_(rows, dateCol) {
  const set = {};
  rows.forEach(r => {
    if (!r[dateCol]) return;
    const d = new Date(r[dateCol]);
    if (isNaN(d)) return;
    set[d.getFullYear() + '-' + (d.getMonth() + 1)] = true;
  });
  return Math.max(1, Object.keys(set).length);
}

function invalidateCache_() {
  try {
    CacheService.getScriptCache().removeAll(['dashboardLastKey']);
  } catch (e) { /* noop */ }
}

function getCachedDashboard_(key) {
  try {
    const c = CacheService.getScriptCache();
    const v = c.get('dash_' + key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function setCachedDashboard_(key, data) {
  try {
    CacheService.getScriptCache().put('dash_' + key, JSON.stringify(data), CACHE_TTL_SECONDS);
  } catch (e) { /* might exceed quota — silent fail */ }
}

// ════════════════════════════════════════════════════════════════════
//  Main: getDashboardData
// ════════════════════════════════════════════════════════════════════

function getDashboardData(month, year) {
  initSheets_();
  month = parseInt(month);
  year = parseInt(year);

  const cacheKey = year + '-' + month;
  const cached = getCachedDashboard_(cacheKey);
  if (cached) return cached;

  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;

  // ── Raw sheets ──
  const allInc = getSheetData_(SHEET_NAMES.INCOME);
  const allExp = getSheetData_(SHEET_NAMES.EXPENSE);
  const allSav = getSheetData_(SHEET_NAMES.SAVING);
  const allAssets = getSheetData_(SHEET_NAMES.ASSET);
  const allDebts = getSheetData_(SHEET_NAMES.DEBT);

  const cInc = filterByMonth_(allInc, year, month, 0);
  const cExp = filterByMonth_(allExp, year, month, 0);
  const cSav = filterByMonth_(allSav, year, month, 0);
  const pInc = filterByMonth_(allInc, py, pm, 0);
  const pExp = filterByMonth_(allExp, py, pm, 0);
  const pSav = filterByMonth_(allSav, py, pm, 0);

  // ── Summary ──
  const totalInc = sum_(cInc, 2);
  const totalExp = sum_(cExp, 3);
  const totalSav = sum_(cSav, 2);
  const balance = totalInc - totalExp - totalSav;
  // total transactions: gabungan semua jenis (lebih akurat dari hanya pengeluaran)
  const totalTx = cInc.length + cExp.length + cSav.length;

  const pTotalInc = sum_(pInc, 2);
  const pTotalExp = sum_(pExp, 3);
  const pTotalSav = sum_(pSav, 2);
  const pBalance = pTotalInc - pTotalExp - pTotalSav;
  const pTotalTx = pInc.length + pExp.length + pSav.length;

  // savings rate (%) = (savings ÷ income)
  const savingsRate = totalInc > 0 ? (totalSav / totalInc) * 100 : 0;
  const pSavingsRate = pTotalInc > 0 ? (pTotalSav / pTotalInc) * 100 : 0;

  // ── Daily expenses ──
  const days = new Date(year, month, 0).getDate();
  const daily = new Array(days).fill(0);
  cExp.forEach(r => {
    const d = new Date(r[0]).getDate();
    if (d >= 1 && d <= days) daily[d - 1] += parseFloat(r[3]) || 0;
  });

  // ── Category breakdown ──
  // Helper: normalisasi nama kategori — kosong/'undefined'/'null' → 'Lain-lain'.
  // Mencegah baris lama dengan Category kosong muncul sebagai 'undefined'.
  const normCat_ = (raw) => {
    const s = (raw == null ? '' : String(raw)).trim();
    if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return 'Lain-lain';
    return s;
  };
  const catMap = {};
  const breakdownMap = {};
  cExp.forEach(r => {
    const cat = normCat_(r[1]);
    const sub = r[2] || cat;
    const amt = parseFloat(r[3]) || 0;
    const note = r[4] ? r[4].toString().trim() : '';
    catMap[cat] = (catMap[cat] || 0) + amt;
    const key = sub + '|||' + note;
    if (!breakdownMap[key]) breakdownMap[key] = { sub: sub, note: note, amount: 0 };
    breakdownMap[key].amount += amt;
  });

  const pCatMap = {};
  pExp.forEach(r => {
    const cat = normCat_(r[1]);
    pCatMap[cat] = (pCatMap[cat] || 0) + (parseFloat(r[3]) || 0);
  });

  const top21 = Object.values(breakdownMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 21)
    .map((item, i) => ({ rank: i + 1, name: item.sub, amount: item.amount, note: item.note }));

  const top10 = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n, v]) => ({ name: n, amount: v }));

  const allCats = new Set([...Object.keys(catMap), ...Object.keys(pCatMap)]);
  const catComp = [...allCats].map(c => ({
    category: c,
    current: catMap[c] || 0,
    previous: pCatMap[c] || 0,
    pct: pctChange_(catMap[c] || 0, pCatMap[c] || 0)
  })).sort((a, b) => b.current - a.current);

  // ── 50/30/20 (atau preset user) ──
  let needs = 0, wants = 0;
  Object.entries(catMap).forEach(([cat, amt]) => {
    if (CATEGORY_TYPES[cat] === 'needs') needs += amt;
    else wants += amt;
  });
  const split = getActiveBudgetSplit_();
  const budgeting = {
    needs: needs,
    wants: wants,
    invest: totalSav,
    income: totalInc,
    rule: split.label,
    targets: {
      needs: totalInc * split.needs,
      wants: totalInc * split.wants,
      invest: totalInc * split.invest
    }
  };

  // ── 6 months history + sparkline data ──
  const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const sixMonths = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i, y = year;
    while (m <= 0) { m += 12; y--; }
    const mi = filterByMonth_(allInc, y, m, 0);
    const me = filterByMonth_(allExp, y, m, 0);
    const ms = filterByMonth_(allSav, y, m, 0);
    const incSum = sum_(mi, 2), expSum = sum_(me, 3), savSum = sum_(ms, 2);
    sixMonths.push({
      label: `${mn[m - 1]} ${y}`,
      month: m, year: y,
      income: incSum,
      expenses: expSum,
      savings: savSum,
      balance: incSum - expSum - savSum,
      tx: mi.length + me.length + ms.length,
      savingsRate: incSum > 0 ? (savSum / incSum) * 100 : 0
    });
  }

  // ── Net Worth ──
  let assetDetails = [];
  let totalAssets = 0;
  let liquidAssets = 0;
  let investmentAssets = 0;
  allAssets.forEach((r, i) => {
    if (!r[0]) return;
    const type = (r[1] || '').toString();
    const val = parseFloat(r[3]) || 0;
    assetDetails.push({
      rowIndex: i + 2,
      type: type,
      name: r[2] || '-',
      value: val,
      inst: r[4] || '-'
    });
    totalAssets += val;
    if (LIQUID_ASSET_TYPES.indexOf(type) !== -1) liquidAssets += val;
    if (INVESTMENT_ASSET_TYPES.indexOf(type) !== -1) investmentAssets += val;
  });

  let debtDetails = [];
  let totalDebts = 0;
  allDebts.forEach((r, i) => {
    if (!r[0]) return;
    const val = parseFloat(r[3]) || 0;
    debtDetails.push({
      rowIndex: i + 2,
      type: r[1] || '-',
      name: r[2] || '-',
      value: val,
      inst: r[4] || '-'
    });
    totalDebts += val;
  });

  const netWorth = totalAssets - totalDebts;

  // ── Asset Allocation ──
  const fixedAssets = totalAssets - liquidAssets - investmentAssets;
  const assetAllocation = [
    { label: 'Kas/Bank/E-Wallet', value: liquidAssets, color: '#00e5b4' },
    { label: 'Investasi', value: investmentAssets, color: '#818cf8' },
    { label: 'Aset Tetap', value: Math.max(0, fixedAssets), color: '#f59e0b' }
  ].filter(x => x.value > 0);

  // ── Net Worth History (6 bulan) ──
  // Net Worth saat ini snapshot, kita estimasi historis = NW - sum(savings + balance) bulan-bulan setelahnya
  // Pendekatan simple: NW history = NW_now - cumulative future savings & balances surplus
  let cumulativeFromNow = 0;
  const netWorthHistory = sixMonths.slice().reverse().map((m, idx) => {
    if (idx === 0) {
      return { label: m.label, value: netWorth };
    }
    cumulativeFromNow += (m.savings + m.balance);
    return { label: m.label, value: netWorth - cumulativeFromNow };
  }).reverse();

  // ── Cashflow Forecast (3 bulan ke depan) ──
  // Linear projection berdasarkan rata-rata 3 bulan terakhir
  const last3 = sixMonths.slice(-3);
  const avgInc = last3.reduce((s, m) => s + m.income, 0) / last3.length;
  const avgExp = last3.reduce((s, m) => s + m.expenses, 0) / last3.length;
  const avgSav = last3.reduce((s, m) => s + m.savings, 0) / last3.length;
  const avgNet = avgInc - avgExp - avgSav;
  const forecastMonths = [];
  let projNet = netWorth;
  for (let i = 1; i <= 3; i++) {
    let fm = month + i, fy = year;
    while (fm > 12) { fm -= 12; fy++; }
    projNet += avgNet + avgSav; // savings & balance both naik kekayaan bersih
    forecastMonths.push({
      label: `${mn[fm - 1]} ${fy}`,
      projectedIncome: avgInc,
      projectedExpense: avgExp,
      projectedSaving: avgSav,
      projectedNet: avgNet,
      projectedNetWorth: projNet
    });
  }

  // ── Ratios ──
  const debtPayments = sum_(cExp.filter(r => r[1] === 'Kewajiban & Utang'), 3);
  const dsr = totalInc > 0 ? (debtPayments / totalInc) * 100 : 0;

  const monthsWithExpenseData = uniqueMonthsCount_(allExp, 0);
  const trueAvgMonthlyExpense = sum_(allExp, 3) / monthsWithExpenseData;
  const emergencyFundRatio = trueAvgMonthlyExpense > 0
    ? liquidAssets / trueAvgMonthlyExpense
    : 0;

  const liquidityRatio = trueAvgMonthlyExpense > 0
    ? liquidAssets / trueAvgMonthlyExpense
    : 0;

  const solvencyRatio = totalAssets > 0 ? netWorth / totalAssets : 0;

  const investmentAssetRatio = totalAssets > 0 ? investmentAssets / totalAssets : 0;

  // ── Wallet Balances ──
  const walletBalances = {};
  allInc.forEach(r => {
    const amt = parseFloat(r[2]) || 0;
    const src = r[4] || 'Cash';
    walletBalances[src] = (walletBalances[src] || 0) + amt;
  });
  allExp.forEach(r => {
    const amt = parseFloat(r[3]) || 0;
    const src = r[5] || 'Cash';
    walletBalances[src] = (walletBalances[src] || 0) - amt;
  });
  allSav.forEach(r => {
    const amt = parseFloat(r[2]) || 0;
    const src = r[4] || 'BRI';
    walletBalances[src] = (walletBalances[src] || 0) - amt;
  });

  // ── Subscription Detector & Upcoming Bills ──
  const subscriptions = detectSubscriptions_(allExp);
  const upcomingBills = subscriptions.filter(s => s.daysLeft != null && s.daysLeft <= 7 && !s.paidThisMonth);

  // ── Manual Bills (sheet Bills) untuk bulan ini ──
  const allManualBills = getSheetDataWithRowIndex_(SHEET_NAMES.BILL);
  const manualBillsThisMonth = allManualBills.map(({ row, rowIndex }) => ({
    rowIndex: rowIndex,
    dueDate: toIso_(row[0]),
    name: row[1] || '',
    amount: parseFloat(row[2]) || 0,
    notes: row[3] || ''
  })).filter(b => {
    if (!b.dueDate) return false;
    const d = new Date(b.dueDate);
    return !isNaN(d) && d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // ── Bill Calendar bulan ini ──
  // Kombinasi: subscription (nextDate dlm bulan ini) + manual bills + tagihan rutin (DSR bulan ini)
  const calendarDays = new Array(days).fill(null).map((_, i) => ({ day: i + 1, items: [], total: 0 }));
  // a. Subscriptions yang prediksi nextDate-nya jatuh di bulan/tahun yg sedang dibuka
  subscriptions.forEach(s => {
    if (!s.nextDate) return;
    const dt = new Date(s.nextDate);
    if (isNaN(dt) || dt.getFullYear() !== year || (dt.getMonth() + 1) !== month) return;
    const di = dt.getDate() - 1;
    if (di < 0 || di >= days) return;
    calendarDays[di].items.push({
      type: 'subscription',
      name: s.name,
      amount: s.avgAmount || s.lastAmount || 0,
      paid: !!s.paidThisMonth
    });
  });
  // b. Manual bills bulan ini
  manualBillsThisMonth.forEach(b => {
    const dt = new Date(b.dueDate);
    const di = dt.getDate() - 1;
    if (di < 0 || di >= days) return;
    calendarDays[di].items.push({
      type: 'manual',
      rowIndex: b.rowIndex,
      name: b.name,
      amount: b.amount,
      notes: b.notes
    });
  });
  // Hitung total per hari
  calendarDays.forEach(d => {
    d.total = d.items.reduce((s, x) => s + (x.amount || 0), 0);
  });
  // Total komitmen tersisa = sum bills dari hari ini sampai akhir bulan (yang belum 'paid')
  const todayD = new Date();
  const isCurMonth = (todayD.getFullYear() === year && (todayD.getMonth() + 1) === month);
  const startDay = isCurMonth ? todayD.getDate() : 1;
  let remainingCommitment = 0;
  let remainingCount = 0;
  for (let d = startDay; d <= days; d++) {
    calendarDays[d - 1].items.forEach(it => {
      if (!it.paid) {
        remainingCommitment += (it.amount || 0);
        remainingCount++;
      }
    });
  }
  const calendar = {
    month: month,
    year: year,
    days: calendarDays,
    remainingCommitment: remainingCommitment,
    remainingCount: remainingCount,
    daysLeftInMonth: isCurMonth ? Math.max(0, days - todayD.getDate() + 1) : days
  };

  // ── Burn Rate & Runway (pakai liquid) ──
  const today = new Date();
  const dayOfMonth = today.getDate();
  const burnRate = dayOfMonth > 0 ? totalExp / dayOfMonth : 0;
  // Net burn = exp - income reguler. Kalau surplus → infinite runway.
  const dailyIncome = dayOfMonth > 0 ? totalInc / dayOfMonth : 0;
  const netDailyBurn = burnRate - dailyIncome;
  let runwayDays = 99999;
  if (netDailyBurn > 0) {
    runwayDays = Math.max(0, Math.floor(liquidAssets / netDailyBurn));
  }

  // ── Insights ──
  // Plafon kategori (envelope budgeting) — basis utk progress bar & insight
  const catBudgets = getCategoryBudgets_();
  const categoryBudgets = Object.keys(catBudgets).map(name => {
    const budget = Number(catBudgets[name]) || 0;
    const spent = catMap[name] || 0;
    const pct = budget > 0 ? (spent / budget * 100) : 0;
    let status = 'safe';
    if (pct >= 100) status = 'over';
    else if (pct >= 90) status = 'danger';
    else if (pct >= 70) status = 'warn';
    return {
      name: name,
      budget: budget,
      spent: spent,
      remaining: Math.max(0, budget - spent),
      pct: pct,
      status: status
    };
  }).sort((a, b) => b.pct - a.pct);

  // ── Streak (dihitung dari semua transaksi sepanjang waktu) ──
  const streak = computeStreak_(allInc, allExp, allSav);

  const insights = buildInsights_({
    totalInc, totalExp, totalSav, balance, savingsRate,
    pTotalInc, pTotalExp, pBalance,
    catMap, pCatMap, needs, wants,
    liquidAssets, investmentAssets, totalAssets, totalDebts, netWorth,
    dsr, emergencyFundRatio, runwayDays,
    forecastMonths,
    subscriptions,
    categoryBudgets
  });

  const result = {
    success: true,
    summary: {
      totalInc, totalExp, totalSav, balance, totalTx, savingsRate,
      pTotalInc, pTotalExp, pBalance, pTotalTx, pSavingsRate
    },
    daily, top21, top10, catComp,
    budgeting,
    sixMonths,
    insights,
    netWorth: {
      totalAssets,
      totalDebts,
      netWorth,
      liquidAssets,
      investmentAssets,
      fixedAssets,
      assetDetails,
      debtDetails,
      assetAllocation,
      netWorthHistory
    },
    forecast: {
      months: forecastMonths,
      avgIncome: avgInc,
      avgExpense: avgExp,
      avgSaving: avgSav
    },
    ratios: {
      dsr,
      emergencyFundRatio,
      liquidityRatio,
      solvencyRatio,
      investmentAssetRatio,
      savingsRate
    },
    walletBalances,
    upcomingBills,
    subscriptions,
    manualBills: manualBillsThisMonth,
    calendar: calendar,
    categoryBudgets: categoryBudgets,
    streak: streak,
    burn: {
      dailyExpense: burnRate,
      dailyIncome: dailyIncome,
      netDailyBurn: netDailyBurn,
      runwayDays: runwayDays === 99999 ? null : runwayDays
    }
  };

  setCachedDashboard_(cacheKey, result);
  return result;
}

// ════════════════════════════════════════════════════════════════════
//  Subscription Detector
// ════════════════════════════════════════════════════════════════════

/**
 * Deteksi langganan rutin. Dianggap subscription jika:
 *  - keyword cocok dengan RECURRING_KEYWORDS, ATAU
 *  - subkategori+notes muncul di ≥2 bulan berbeda
 */
function detectSubscriptions_(allExp) {
  const groups = {};
  allExp.forEach(r => {
    const cat = r[1] || '';
    const sub = r[2] || '';
    const note = r[4] ? r[4].toString().trim() : '';
    const src = r[5] || '';
    const key = (sub || cat) + ':' + note;
    if (!groups[key]) {
      groups[key] = {
        name: sub || cat,
        note: note,
        category: cat,
        source: src,
        occurrences: [],
        amounts: []
      };
    }
    groups[key].occurrences.push(new Date(r[0]));
    groups[key].amounts.push(parseFloat(r[3]) || 0);
  });

  const today = new Date();
  const out = [];

  Object.values(groups).forEach(g => {
    const months = {};
    g.occurrences.forEach(d => {
      months[d.getFullYear() + '-' + (d.getMonth() + 1)] = true;
    });
    const monthCount = Object.keys(months).length;

    const text = (g.name + ' ' + g.note).toLowerCase();
    const hasKeyword = RECURRING_KEYWORDS.some(k => text.indexOf(k.toLowerCase()) !== -1);

    if (!hasKeyword && monthCount < 2) return;

    g.occurrences.sort((a, b) => a - b);
    const last = g.occurrences[g.occurrences.length - 1];
    const lastIdx = g.occurrences.length - 1;
    const lastAmount = g.amounts[lastIdx];
    const avgAmount = g.amounts.reduce((s, n) => s + n, 0) / g.amounts.length;

    // predict next ≈ last + 1 bulan
    const nextDate = new Date(last);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

    // sudah dibayar bulan ini?
    const curMonthKey = today.getFullYear() + '-' + (today.getMonth() + 1);
    const paidThisMonth = !!months[curMonthKey];

    out.push({
      name: g.name,
      note: g.note,
      category: g.category,
      source: g.source,
      monthCount: monthCount,
      lastDate: Utilities.formatDate(last, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      lastAmount: lastAmount,
      avgAmount: avgAmount,
      nextDate: Utilities.formatDate(nextDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      nextDateLabel: Utilities.formatDate(nextDate, Session.getScriptTimeZone(), 'd MMM'),
      daysLeft: diffDays,
      paidThisMonth: paidThisMonth,
      // legacy field for compatibility
      date: Utilities.formatDate(nextDate, Session.getScriptTimeZone(), 'd MMM'),
      amount: lastAmount
    });
  });

  return out.sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));
}

// ════════════════════════════════════════════════════════════════════
//  Recent Transactions (untuk widget edit/hapus)
// ════════════════════════════════════════════════════════════════════

function listRecentTransactions(month, year, limit) {
  initSheets_();
  month = parseInt(month);
  year = parseInt(year);
  limit = parseInt(limit) || 50;

  const incRows = getSheetDataWithRowIndex_(SHEET_NAMES.INCOME);
  const expRows = getSheetDataWithRowIndex_(SHEET_NAMES.EXPENSE);
  const savRows = getSheetDataWithRowIndex_(SHEET_NAMES.SAVING);

  const all = [];

  incRows.forEach(({ row, rowIndex }) => {
    if (!row[0]) return;
    const d = new Date(row[0]);
    if (isNaN(d) || d.getFullYear() !== year || (d.getMonth() + 1) !== month) return;
    all.push({
      kind: 'income',
      sheet: 'income',
      rowIndex: rowIndex,
      date: toIso_(row[0]),
      type: row[1] || '',
      category: '',
      subcategory: '',
      amount: parseFloat(row[2]) || 0,
      notes: row[3] || '',
      source: row[4] || ''
    });
  });

  expRows.forEach(({ row, rowIndex }) => {
    if (!row[0]) return;
    const d = new Date(row[0]);
    if (isNaN(d) || d.getFullYear() !== year || (d.getMonth() + 1) !== month) return;
    all.push({
      kind: 'expense',
      sheet: 'expense',
      rowIndex: rowIndex,
      date: toIso_(row[0]),
      type: '',
      category: row[1] || '',
      subcategory: row[2] || '',
      amount: parseFloat(row[3]) || 0,
      notes: row[4] || '',
      source: row[5] || ''
    });
  });

  savRows.forEach(({ row, rowIndex }) => {
    if (!row[0]) return;
    const d = new Date(row[0]);
    if (isNaN(d) || d.getFullYear() !== year || (d.getMonth() + 1) !== month) return;
    all.push({
      kind: 'saving',
      sheet: 'saving',
      rowIndex: rowIndex,
      date: toIso_(row[0]),
      type: row[1] || '',
      category: '',
      subcategory: '',
      amount: parseFloat(row[2]) || 0,
      notes: row[3] || '',
      source: row[4] || ''
    });
  });

  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { success: true, transactions: all.slice(0, limit) };
}

// ════════════════════════════════════════════════════════════════════
//  Insights Builder
// ════════════════════════════════════════════════════════════════════

function buildInsights_(d) {
  const out = [];
  const fmt = n => fmtRp_(n);
  const p = (a, b) => pctChange_(a, b);

  // 1. Overall balance
  if (d.balance < 0) {
    out.push({ type: 'danger', icon: '🚨', title: 'Defisit Keuangan!',
      text: `Pengeluaran melebihi pemasukan sebesar ${fmt(Math.abs(d.balance))}. Segera identifikasi & pangkas pos non-esensial bulan ini.` });
  } else if (d.totalInc > 0 && d.balance / d.totalInc < 0.1) {
    out.push({ type: 'warning', icon: '⚠️', title: 'Saldo Sangat Tipis',
      text: `Sisa saldo hanya ${(d.balance/d.totalInc*100).toFixed(1)}% dari pemasukan. Tahan pengeluaran discretionary hingga akhir bulan.` });
  } else if (d.totalInc > 0 && d.balance / d.totalInc >= 0.3) {
    out.push({ type: 'success', icon: '✅', title: 'Keuangan Sangat Sehat!',
      text: `Saldo bersih ${fmt(d.balance)} (${(d.balance/d.totalInc*100).toFixed(1)}% dari pemasukan). Alokasikan surplus ke investasi produktif.` });
  }

  // 2. Savings rate
  if (d.totalInc > 0) {
    const sr = d.savingsRate;
    if (sr < 10)
      out.push({ type: 'warning', icon: '💰', title: 'Tabungan Masih Rendah',
        text: `Persentase menabung Anda ${sr.toFixed(1)}% — di bawah target 20%. Otomasi transfer ke tabungan saat gajian (pay yourself first).` });
    else if (sr >= 20)
      out.push({ type: 'success', icon: '🎯', title: 'Target Tabungan Tercapai!',
        text: `Persentase menabung ${sr.toFixed(1)}% sudah melampaui target 20%. Diversifikasi ke reksadana/saham untuk hasil lebih optimal.` });
  }

  // 3. Top spending category
  const top = Object.entries(d.catMap).sort((a, b) => b[1] - a[1])[0];
  if (top && d.totalExp > 0) {
    const cp = (top[1] / d.totalExp * 100).toFixed(1);
    if (parseFloat(cp) > 40)
      out.push({ type: 'warning', icon: '📊', title: `Dominasi: ${top[0]}`,
        text: `${top[0]} menyerap ${cp}% dari total pengeluaran (${fmt(top[1])}). Cari alternatif yang lebih hemat.` });
  }

  // 4. Income MoM
  if (d.pTotalInc > 0) {
    const ic = p(d.totalInc, d.pTotalInc);
    if (ic < -10)
      out.push({ type: 'warning', icon: '📉', title: 'Pemasukan Menurun',
        text: `Pemasukan turun ${Math.abs(ic).toFixed(1)}% dari bulan lalu. Pertimbangkan side income atau negosiasi gaji.` });
    else if (ic > 15)
      out.push({ type: 'success', icon: '📈', title: 'Pemasukan Meningkat!',
        text: `Pemasukan naik ${ic.toFixed(1)}% (+${fmt(d.totalInc-d.pTotalInc)}). Alokasikan kenaikan ini ke dana darurat/investasi.` });
  }

  // 5. Emergency fund
  if (d.emergencyFundRatio < 3 && d.liquidAssets > 0) {
    out.push({ type: 'warning', icon: '🛡️', title: 'Dana Darurat Rentan',
      text: `Dana darurat hanya ${d.emergencyFundRatio.toFixed(1)}× pengeluaran bulanan (target 3-6×). Prioritaskan menambah pos ini.` });
  } else if (d.emergencyFundRatio >= 6) {
    out.push({ type: 'success', icon: '🛡️', title: 'Dana Darurat Sangat Kuat',
      text: `Dana darurat ${d.emergencyFundRatio.toFixed(1)}× pengeluaran. Surplus bisa dipindah ke investasi return lebih tinggi.` });
  }

  // 6. DSR
  if (d.dsr > 30) {
    out.push({ type: 'danger', icon: '🚨', title: 'Beban Utang Tinggi',
      text: `DSR ${d.dsr.toFixed(1)}% (>30%). Risiko cashflow terganggu. Snowball method atau refinance bisa membantu.` });
  }

  // 7. Runway warning
  if (d.runwayDays != null && d.runwayDays < 30 && d.runwayDays > 0) {
    out.push({ type: 'danger', icon: '⏳', title: 'Ketahanan Dana Pendek',
      text: `Aset likuid hanya cukup ${d.runwayDays} hari kedepan jika income stop. Bangun dana darurat segera.` });
  }

  // 8. Forecast warning
  if (d.forecastMonths && d.forecastMonths.length) {
    const lastFc = d.forecastMonths[d.forecastMonths.length - 1];
    if (lastFc.projectedNet < 0) {
      out.push({ type: 'warning', icon: '🔮', title: 'Proyeksi 3 Bulan Ke Depan: Defisit',
        text: `Tren saat ini menunjukkan defisit ${fmt(Math.abs(lastFc.projectedNet))}/bln. Audit pengeluaran sekarang untuk cegah masalah ke depan.` });
    }
  }

  // 9. Subscriptions count
  if (d.subscriptions && d.subscriptions.length >= 5) {
    const total = d.subscriptions.reduce((s, x) => s + (x.avgAmount || 0), 0);
    out.push({ type: 'info', icon: '🔁', title: `${d.subscriptions.length} Langganan Terdeteksi`,
      text: `Total estimasi ${fmt(total)}/bulan untuk langganan rutin. Audit yang sudah jarang dipakai.` });
  }

  // 9b. Envelope Budgeting — kategori melewati plafon
  if (d.categoryBudgets && d.categoryBudgets.length) {
    const over = d.categoryBudgets.filter(c => c.status === 'over');
    const danger = d.categoryBudgets.filter(c => c.status === 'danger');
    if (over.length) {
      const top = over[0];
      out.push({ type: 'danger', icon: '🚫', title: `Plafon "${top.name}" Terlampaui`,
        text: `Sudah ${top.pct.toFixed(0)}% dari plafon (${fmt(top.spent)}/${fmt(top.budget)})${over.length > 1 ? ` — dan ${over.length - 1} kategori lain juga over.` : '.'} Hentikan pengeluaran kategori ini sampai akhir bulan.` });
    } else if (danger.length) {
      const top = danger[0];
      out.push({ type: 'warning', icon: '⚠️', title: `Hampir Habis: "${top.name}"`,
        text: `Sudah ${top.pct.toFixed(0)}% plafon (${fmt(top.spent)}/${fmt(top.budget)}). Sisa ${fmt(top.remaining)} — hati-hati pengeluaran berikutnya.` });
    }
  }

  // 10. 50/30/20
  if (d.totalInc > 0) {
    const wp = d.wants / d.totalInc * 100;
    const np = d.needs / d.totalInc * 100;
    if (wp > 35)
      out.push({ type: 'warning', icon: '🛍️', title: 'Gaya Hidup Berlebih',
        text: `Pengeluaran Keinginan ${wp.toFixed(1)}% (>30% target). Audit langganan & belanja online.` });
    if (np > 55)
      out.push({ type: 'warning', icon: '🏠', title: 'Biaya Hidup Tinggi',
        text: `Pengeluaran Kebutuhan ${np.toFixed(1)}% (>50% target). Evaluasi sewa, transport, atau belanja makanan.` });
  }

  if (out.length === 0)
    out.push({ type: 'info', icon: '💡', title: 'Tambahkan Data Lebih Banyak',
      text: 'Catat pemasukan & pengeluaran selama 1-2 bulan untuk mendapat analisis personal yang akurat.' });

  return out;
}

// ════════════════════════════════════════════════════════════════════
//  PDF Report (sekarang via doPost juga)
// ════════════════════════════════════════════════════════════════════

function generatePDFReport(month, year) {
  const data = getDashboardData(month, year);
  if (!data.success) throw new Error(data.error);

  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const periodName = `${monthNames[month - 1]} ${year}`;

  const html = `
    <style>
      body { font-family: 'Helvetica', sans-serif; color: #1e293b; padding: 24px; }
      h1 { color: #0f172a; margin: 0; font-size: 22px; }
      h3 { color: #0f172a; border-bottom: 2px solid #00c49a; padding-bottom: 4px; margin-top: 22px; font-size: 14px; }
      .header { text-align: center; border-bottom: 2px solid #00e5b4; padding-bottom: 12px; margin-bottom: 20px;}
      .summary-box { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
      .card { background: #f8fafc; padding: 12px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #e2e8f0; }
      .card h4 { margin: 0 0 6px; font-size: 11px; color: #64748b; text-transform: uppercase; }
      .card p { margin: 0; font-size: 14px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; font-size: 12px; }
      th { background: #f1f5f9; }
      .ok { color: #16a34a; font-weight: 700; }
      .bad { color: #dc2626; font-weight: 700; }
      .insight { padding: 8px 10px; margin: 6px 0; border-left: 3px solid #00c49a; background: #f8fafc; font-size: 12px; }
      .footer { margin-top: 24px; text-align: center; color: #94a3b8; font-size: 10px; }
    </style>
    <div class="header">
      <h1>📊 Laporan Audit Keuangan</h1>
      <p style="margin:4px 0 0; color:#64748b; font-size:12px;">Money Tracker Pro &middot; Periode: ${periodName}</p>
    </div>
    <div class="summary-box">
      <div class="card"><h4>Pemasukan</h4><p style="color:#16a34a;">${fmtRp_(data.summary.totalInc)}</p></div>
      <div class="card"><h4>Pengeluaran</h4><p style="color:#dc2626;">${fmtRp_(data.summary.totalExp)}</p></div>
      <div class="card"><h4>Tabungan</h4><p style="color:#6366f1;">${fmtRp_(data.summary.totalSav)}</p></div>
      <div class="card"><h4>Sisa Saldo</h4><p style="color:#0891b2;">${fmtRp_(data.summary.balance)}</p></div>
    </div>
    <h3>⚖️ Neraca Kekayaan</h3>
    <table>
      <tr><th>Total Aset</th><td>${fmtRp_(data.netWorth.totalAssets)}</td></tr>
      <tr><th>Aset Likuid</th><td>${fmtRp_(data.netWorth.liquidAssets)}</td></tr>
      <tr><th>Total Hutang</th><td>${fmtRp_(data.netWorth.totalDebts)}</td></tr>
      <tr><th>Kekayaan Bersih</th><td><b>${fmtRp_(data.netWorth.netWorth)}</b></td></tr>
    </table>

    <h3>🩺 Rasio Kesehatan</h3>
    <table>
      <tr><th>Metrik</th><th>Nilai</th><th>Status</th></tr>
      <tr><td>Persentase Menabung <span style="color:#94a3b8">(Savings Rate)</span></td><td>${data.ratios.savingsRate.toFixed(1)}%</td><td class="${data.ratios.savingsRate>=20?'ok':'bad'}">${data.ratios.savingsRate>=20?'Sehat':'Perlu Naik'}</td></tr>
      <tr><td>Beban Utang <span style="color:#94a3b8">(DSR)</span></td><td>${data.ratios.dsr.toFixed(1)}%</td><td class="${data.ratios.dsr<=30?'ok':'bad'}">${data.ratios.dsr<=30?'Aman':'Bahaya'}</td></tr>
      <tr><td>Dana Darurat <span style="color:#94a3b8">(Emergency Fund)</span></td><td>${data.ratios.emergencyFundRatio.toFixed(1)}× bln</td><td class="${data.ratios.emergencyFundRatio>=3?'ok':'bad'}">${data.ratios.emergencyFundRatio>=6?'Sangat Kuat':data.ratios.emergencyFundRatio>=3?'Cukup':'Rentan'}</td></tr>
      <tr><td>Aset Bersih dari Hutang <span style="color:#94a3b8">(Solvency)</span></td><td>${(data.ratios.solvencyRatio*100).toFixed(1)}%</td><td class="${data.ratios.solvencyRatio>=0.5?'ok':'bad'}">${data.ratios.solvencyRatio>=0.5?'Sehat':'Leverage Tinggi'}</td></tr>
      <tr><td>Porsi Aset Berkembang <span style="color:#94a3b8">(Investment Ratio)</span></td><td>${(data.ratios.investmentAssetRatio*100).toFixed(1)}%</td><td>—</td></tr>
    </table>

    <h3>🤖 Rekomendasi AI</h3>
    ${(data.insights || []).slice(0, 5).map(i => `<div class="insight"><b>${i.icon} ${i.title}</b><br>${i.text}</div>`).join('')}

    <div class="footer">Dihasilkan otomatis oleh Money Tracker Pro &middot; ${new Date().toLocaleString('id-ID')}</div>
  `;

  const blob = Utilities.newBlob(html, 'text/html', 'Financial_Report.html');
  const pdfBlob = blob.getAs('application/pdf');
  const base64 = Utilities.base64Encode(pdfBlob.getBytes());

  return {
    success: true,
    filename: `Laporan_Keuangan_${periodName}.pdf`,
    base64: base64
  };
}

// ════════════════════════════════════════════════════════════════════
//  Gemini Deep Analysis
// ════════════════════════════════════════════════════════════════════

/**
 * Analisa CFP-style dengan data konteks komprehensif.
 * Frontend mengirim payload kaya berisi:
 *   - Cashflow & Budget (existing)
 *   - Health metrics + nwTrend
 *   - Top 3 expense + biggestMoMRise
 *   - Subscriptions total + count
 *   - Negative wallets warning
 *   - Goals aktif dengan ETA monthly
 *   - monthsOfData (untuk validasi disclaimer)
 */
function getGeminiDeepAnalysis(d) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY belum diset di Script Properties.' };
  }

  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  // ── Format helpers untuk fallback ──
  const v = (val, fallback) => (val !== undefined && val !== null && val !== '') ? val : (fallback || '—');
  const monthsOfData = parseInt(d.monthsOfData, 10) || 1;
  const isShortHistory = monthsOfData < 3;

  // Format top 3 list
  const topExpenseLines = (d.topExpenses && d.topExpenses.length)
    ? d.topExpenses.slice(0, 3).map((t, i) => `    ${i + 1}. ${t.name} — ${t.amount} (${t.pct}% dari total pengeluaran)`).join('\n')
    : '    (Belum ada data pengeluaran cukup)';

  // Goals section
  const goalsBlock = (d.goalsList && d.goalsList.length)
    ? d.goalsList.split('\n').filter(x => x.trim()).join('\n')
    : '  (Belum ada tujuan keuangan aktif)';

  const disclaimer = isShortHistory
    ? '\n\nCATATAN UNTUK ANDA: data baru tersedia ' + monthsOfData + ' bulan, jadi tutup analisis Anda dengan paragraf singkat yang mengingatkan pengguna bahwa proyeksi & rasio akan jauh lebih akurat setelah minimal 3-6 bulan pencatatan rutin.'
    : '';

  const prompt = `Bertindaklah sebagai Perencana Keuangan Tersertifikasi (CFP) senior berpengalaman 15+ tahun di Indonesia, yang biasa menangani klien menengah profesional. Anda objektif, tajam, suportif, dan jago menerjemahkan angka jadi cerita yang bermakna.

Klien Anda: pekerja yang sedang membangun fondasi kekayaan dan butuh review bulanan. Anda diminta memberi audit ringkas namun tepat sasaran.

═══════════ DATA KEUANGAN — ${v(d.monthName, 'Bulan ini')} ${v(d.year, '')} ═══════════

ARUS KAS BULAN INI
  • Pemasukan ............ ${v(d.totalInc)}
  • Pengeluaran .......... ${v(d.totalExp)}
  • Tabungan/Investasi ... ${v(d.totalSav)}
  • Sisa Saldo ........... ${v(d.balance)}
  • Persentase Menabung .. ${v(d.savingsRate)}% (target sehat ≥ 20%)

ALOKASI ANGGARAN (aturan ${v(d.ruleLabel, '50/30/20')})
  • Kebutuhan ${v(d.pNeeds)}% (target ${v(d.ruleNeeds, '50')}%)
  • Keinginan ${v(d.pWants)}% (target ${v(d.ruleWants, '30')}%)
  • Investasi ${v(d.pInvest)}% (target ${v(d.ruleInvest, '20')}%)

KESEHATAN FINANSIAL
  • Ketahanan Dana ............... ${v(d.runwayDays)} hari (ideal ≥ 90 hari / 3 bulan)
  • Beban Utang (DSR) ............ ${v(d.dsr)}% (bahaya jika > 30%)
  • Dana Darurat ................. ${v(d.emergencyFund)}× pengeluaran bulanan (ideal 3-6×)
  • Cadangan Uang Cair ........... ${v(d.liquidityRatio)}× pengeluaran (ideal ≥ 3×)
  • Aset Bersih dari Hutang ...... ${v(d.solvencyRatio)}% (sehat ≥ 50%)
  • Porsi Aset Berkembang ........ ${v(d.investmentAssetRatio)}% (idealnya naik seiring usia)
  • Kekayaan Bersih bulan ini .... ${v(d.netWorth)} (${v(d.nwTrend, 'tren belum tersedia')})

POLA & KEBOCORAN
  • Top 3 Kategori Pengeluaran:
${topExpenseLines}
  • Kategori naik tajam dari bulan lalu: ${v(d.biggestMoMRise, 'tidak ada kenaikan signifikan')}
  • Total langganan rutin terdeteksi: ${v(d.subsTotal, 'Rp 0')}/bulan (${v(d.subsCount, '0')} langganan)
  • Dompet bermasalah (saldo negatif): ${v(d.negativeWallets, 'tidak ada')}

PLAFON KATEGORI (Envelope Budgeting)
${v(d.categoryBudgetsBlock, '  (Belum ada plafon kategori yang diatur)')}

KONSISTENSI PENCATATAN
  • Streak hari berturut-turut: ${v(d.streakCurrent, '0')} hari (terpanjang: ${v(d.streakLongest, '0')} hari)

TUJUAN KEUANGAN AKTIF
${goalsBlock}

DURASI DATA TERCATAT: ${monthsOfData} bulan${disclaimer}

═══════════ TUGAS ═══════════

Berikan analisis dengan struktur PERSIS seperti ini (maksimal 350 kata total):

**📊 Diagnosis Kondisi**
2-3 kalimat. Ringkas kondisi keuangan klien dalam 1 kalimat utuh: solid, rapuh, sedang membaik, atau memburuk? Dukung dengan 1-2 angka kunci paling representatif.

**🚨 Risiko Utama yang Perlu Diwaspadai**
Pilih SATU risiko paling urgent dari data di atas. Jelaskan kenapa berbahaya dan apa konsekuensi konkretnya kalau dibiarkan 3-6 bulan ke depan. Hubungkan dengan tujuan keuangan klien jika relevan.

**🎯 Aksi Konkret untuk ${v(d.nextMonthName, 'bulan depan')}**
Berikan SATU langkah yang:
- Spesifik (sebutkan nominal/kategori/aksi konkret, bukan saran umum)
- Terukur (target angka yang bisa dicek bulan depan)
- Realistis (mempertimbangkan tujuan & kondisi klien sekarang)

GAYA & ATURAN:
- Sapa langsung pakai "Anda" — bukan "klien".
- Bahasa profesional tapi SANGAT SEDERHANA — hindari jargon. Jika perlu pakai istilah teknis, kasih definisi singkat di kurung.
- Pakai markdown **bold** untuk angka & kata kunci penting.
- 1-2 emoji per paragraf maksimal, jangan berlebihan.
- Tegas & lugas — jangan bertele-tele atau menggurui.
- Jangan menyarankan produk keuangan spesifik (reksadana XYZ, dll). Cukup kategori (reksadana pasar uang, deposito, dll).`;

  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const resp = UrlFetchApp.fetch(apiUrl, options);
    const code = resp.getResponseCode();
    if (code !== 200) {
      return { success: false, error: 'Gemini API error ' + code + ': ' + resp.getContentText().slice(0, 200) };
    }
    const result = JSON.parse(resp.getContentText());
    const text = result.candidates && result.candidates[0] && result.candidates[0].content
      && result.candidates[0].content.parts[0].text;
    if (!text) return { success: false, error: 'Respons AI kosong' };
    return { success: true, text: text };
  } catch (e) {
    return { success: false, error: 'Koneksi AI bermasalah: ' + e.message };
  }
}
