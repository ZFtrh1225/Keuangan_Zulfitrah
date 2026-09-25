# Money Tracker Pro v2 — Migration Guide

Aplikasi keuangan personal dengan **financial intelligence** (savings rate, asset allocation, cashflow forecast, goal tracker, subscription detector, dll).

## 📦 Struktur File

```
Keuangan_Zulfitrah/
├── index.html         ← Markup utama (~600 baris, semua section)
├── styles.css         ← Stylesheet lengkap (tokens, responsive, skeleton, FAB)
├── manifest.json      ← PWA manifest
├── sw.js              ← Service Worker (offline + cache)
├── Code.gs            ← Backend Google Apps Script (paste ke Apps Script editor)
└── js/
    ├── formatters.js  ← Currency, date, util formatters
    ├── state.js       ← State management + localStorage cache
    ├── api.js         ← Centralized API client (fetch + retry)
    ├── charts.js      ← Chart.js renderers (line, donut, gauge, sparkline, pie)
    └── app.js         ← Main app logic (events, render, modals)
```

## 🚀 Cara Deploy

### 1. Backend (Google Apps Script)
1. Buka Google Sheet kamu → **Extensions → Apps Script**
2. Cadangkan file `Code.gs` dan Google Sheet, lalu ganti isi `Code.gs` dengan versi repo ini.
3. **PENTING**: Pindahkan API key Gemini ke Script Properties:
   - **File → Project Settings → Script Properties → Add Property**
   - Key: `GEMINI_API_KEY`
   - Value: API key kamu (yang sudah di-regenerate dari Google AI Studio)
4. **Deploy → Manage deployments → Edit (✏️) → New version → Deploy**
5. Salin URL deployment baru. Update di `js/api.js` baris 12 (`API_URL`).
   > Jika URL tidak berubah, tidak perlu update.

### 2. Frontend (GitHub Pages)
1. Tinjau dan merge pull request perubahan frontend ke `main` setelah backend diperbarui.
2. Muat ulang aplikasi/PWA untuk mengambil berkas frontend yang baru.
3. GitHub Pages akan auto-rebuild
4. Buka URL Pages — semua file (`index.html`, `styles.css`, `js/*.js`, `manifest.json`, `sw.js`) ter-host otomatis

## ✨ Fitur Baru

### Financial Intelligence
- **Savings Rate** — % income yang ditabung (metrik kekayaan #1)
- **Wallet Overview** — saldo per dompet di dashboard utama
- **Asset Allocation** — donut diversifikasi (Kas / Investasi / Aset Tetap)
- **Net Worth Trend** — sparkline 6 bulan
- **Cashflow Forecast** — proyeksi 3 bulan ke depan (linear)
- **Goal Tracker** — tujuan SMART dengan ETA monthly required
- **Subscription Detector** — auto-deteksi langganan rutin (Netflix, Spotify, dll)
- **Rasio baru**: Liquidity, Solvency, Investment Asset Ratio

### UX
- **Floating Action Button (FAB)** — quick add kapan saja
- **Skeleton screen** + cache-first render (instant load dari cache, fetch async)
- **Edit & hapus transaksi** dari daftar transaksi bulan ini
- **Search** transaksi
- **Drill-down** klik baris bulan di history → buka bulan tsb
- **Onboarding** modal 3-step untuk user baru
- **Budget rule presets**: 50/30/20, 70/20/10, atau Custom
- **PWA**: instal ke home screen, offline-able

### Bug Fixes
- ❌→✅ `google.script.run` yang broken di GitHub Pages → ganti ke `fetch` semua
- ❌→✅ `emergencyFundRatio` pakai total aset → sekarang pakai liquid only
- ❌→✅ `avgExp = sum / 12` → sekarang divide by jumlah bulan unik
- ❌→✅ Burn rate pakai total aset → sekarang pakai liquid + net dari income
- ❌→✅ CSS rusak (`@media` duplikat, missing braces) → bersih
- ❌→✅ Variable `dashboardData` vs `dashData` kembar → konsisten satu state global

## 🔐 Keamanan

- Gemini API key sekarang di **Script Properties** (server-side), tidak ke-leak ke source code lagi
- Wajib regenerate key lama (yang sebelumnya hardcoded) di Google AI Studio

## 🛠️ Customization

Untuk mengubah:
- **Kategori expense**: edit `CATEGORY_TYPES` di `Code.gs` + `SUBCATS` di `js/app.js`
- **Recurring keywords**: edit `RECURRING_KEYWORDS` di `Code.gs`
- **Cache TTL**: edit `CACHE_TTL_SECONDS` di `Code.gs`
- **Theme color**: edit CSS tokens di `styles.css` section 1

## ⚠️ Catatan Migrasi Data Tabungan

Backend perlu diperbarui dan di-deploy **sebelum** frontend baru dipakai. Frontend lama
tidak dapat menambah tabungan setelah backend baru aktif: muat ulang aplikasi/PWA
untuk mendapatkan formulir yang meminta dompet asal dan rekening tujuan.

Backend menambahkan kolom `Destination` di sebelah kanan sheet `Savings` saat
inisialisasi. Baris lama tidak diubah: kolom `Source` pada formulir lama berlabel
“Rekening Tujuan”, sehingga dompet asal sebenarnya tidak diketahui. Dashboard
mempertahankan perhitungan historis lama dan menampilkan jumlah baris yang perlu
direkonsiliasi. Setelah memeriksa riwayat rekening, buka transaksi tabungan lama,
isi **Dompet asal** dan periksa **Rekening tujuan**; saldo akan dihitung ulang.
Jangan mengisi dompet asal berdasarkan dugaan.

Tabungan baru adalah perpindahan antar dompet. Bila tujuan merupakan investasi,
atur jenis dompet tujuan sebagai `Investasi`; jangan catat saldo akun yang sama
sekali lagi sebagai aset manual karena itu menggandakan kekayaan bersih.

## 🎯 Setoran Tujuan Terhubung

Deploy backend baru **sebelum** merge frontend. Backend menambahkan kolom `Id`
ke sheet `Goals` dan `GoalId` ke sheet `Savings`; ID tujuan lama akan dibuat
otomatis tanpa mengubah nilai `Saved`. Kolom `Saved` lama kini menjadi **Saldo
Awal Tujuan**, sedangkan progress yang ditampilkan adalah saldo awal ditambah
semua transaksi tabungan yang tertaut. Tidak ada setoran lama yang ditautkan
secara otomatis karena asal dananya belum dapat dipastikan.

Tombol **+ Setor** pada kartu tujuan meminta dompet asal, rekening tujuan,
tanggal, dan nominal. Satu penyimpanan menambah baris `Savings` bertautan;
saldo dompet serta progress tujuan dihitung dari baris itu. Form Tabungan juga
menyediakan pilihan tujuan opsional. Edit atau hapus transaksi bertautan akan
mengubah progress otomatis. Menghapus tujuan melepas tautannya tetapi tetap
menyimpan transaksi dan perpindahan uang.

Jangan catat kembali setoran yang sama melalui form Tabungan. Setelah update,
periksa contoh setoran kecil dan cocokkan saldo dompet serta progress tujuan.
