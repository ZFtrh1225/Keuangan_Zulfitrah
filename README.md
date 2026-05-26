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
2. Hapus seluruh isi `Code.gs` lama, paste isi `Code.gs` di repo ini
3. **PENTING**: Pindahkan API key Gemini ke Script Properties:
   - **File → Project Settings → Script Properties → Add Property**
   - Key: `GEMINI_API_KEY`
   - Value: API key kamu (yang sudah di-regenerate dari Google AI Studio)
4. **Deploy → Manage deployments → Edit (✏️) → New version → Deploy**
5. Salin URL deployment baru. Update di `js/api.js` baris 12 (`API_URL`).
   > Jika URL tidak berubah, tidak perlu update.

### 2. Frontend (GitHub Pages)
1. Push branch `feat/v2-financial-intelligence` ke GitHub
2. Merge ke `main` (atau test dari branch dulu)
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

## ⚠️ Catatan Migrasi Data

Tidak ada perubahan struktur sheet — data lama tetap kompatibel.
Sheet baru `Goals` akan dibuat otomatis saat pertama kali dipanggil.
