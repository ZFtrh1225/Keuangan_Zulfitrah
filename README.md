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

## 🔎 Pencocokan Saldo Dompet

Perbarui dan deploy `Code.gs` **sebelum** menggabungkan frontend. Backend
membuat sheet `WalletReconciliations` untuk riwayat pengecekan dan koreksi;
sheet serta transaksi lama tidak diubah. Buka **Kelola Dompet & Saldo Awal**,
pilih dompet, masukkan saldo rekening atau kas saat ini, lalu **Catat Pengecekan**.
Aplikasi menyimpan saldo pembukuan saat diperiksa, saldo sebenarnya, dan selisih.

Pengecekan tidak mengubah saldo. Periksa transaksi yang mungkin terlewat atau
ganda terlebih dahulu. Jika perlu, isi alasan dan pilih **Terapkan penyesuaian**
di riwayat. Koreksi dicatat satu kali, memengaruhi saldo dompet dan kekayaan
bersih tanpa mengubah saldo awal atau menciptakan pemasukan/pengeluaran palsu.
Jika ada transaksi baru atau saldo pembukuan berubah sejak pengecekan,
penyesuaian lama ditolak dan Anda harus mencatat pengecekan baru. Jika koreksi
keliru, catat pengecekan baru lalu buat penyesuaian balik; riwayat tetap utuh.

## 📅 Riwayat Kekayaan Bersih Tercatat

Deploy `Code.gs` dari pembaruan ini **sebelum** frontend. Sheet baru
`NetWorthSnapshots` dibuat otomatis; data lama tetap ada. Di kartu **Kekayaan
Bersih**, buka **Riwayat & Catat Sekarang** lalu simpan snapshot setelah memastikan
saldo dompet, nilai aset, dan utang sudah mutakhir. Tanggal dan waktu diambil
oleh backend saat tombol ditekan; snapshot tidak bisa diberi tanggal lampau.
Anda dapat mencatat ulang pada hari yang sama bila nilainya berubah; bila semua
angka sama, klik berulang tidak membuat duplikat. Catat minimal sekali per
bulan untuk membentuk grafik bulanan.

Grafik kekayaan bersih kini hanya memakai **snapshot yang sungguh tersimpan**,
satu titik terakhir untuk setiap bulan (maksimal 12 bulan); bulan tanpa catatan
menjadi jeda, sedangkan popup
menampilkan semua snapshot terbaru beserta tanggal dan rinciannya. Perkiraan
historis lama dari arus kas tidak lagi ditampilkan sebagai nilai pasti. Tidak
ada backfill otomatis untuk bulan sebelum snapshot pertama karena nilai aset,
utang, serta koreksi saldo pada tanggal lama tidak dapat dipastikan dari data
terkini. Nilai snapshot menggambarkan isi aplikasi pada saat pencatatan, bukan
verifikasi independen atas rekening atau nilai pasar aset.

## 🧭 Simulasi Skenario Keuangan

Di tab **Perencanaan → Simulasi Skenario Keuangan**, bandingkan proyeksi kekayaan
bersih kondisi dasar dengan perubahan pendapatan, pengeluaran, biaya sekali,
dan jangka waktu 6–60 bulan. Angka dasar diisi dari nilai tengah bulan-bulan
yang sudah selesai dalam enam bulan terakhir; bulan berjalan yang belum penuh
tidak dijadikan dasar. Anda dapat mengubah semua angka dasar saat datanya
belum lengkap atau berbeda dari rencana ke depan.

Pilih tujuan serta rencana setoran per bulan untuk melihat progres nominalnya.
Setoran antar dompet **tidak** mengubah total kekayaan bersih; jika setoran
melampaui surplus bulanan, aplikasi memberi peringatan bahwa selisih harus
didanai dari saldo yang sudah ada. Pengeluaran sekali dipotong pada bulan
pertama. Simulasi menganggap nominal bulanan tetap, tanpa inflasi, imbal hasil,
kenaikan harga aset, dan perubahan utang di luar biaya yang dimasukkan.
Hasilnya adalah contoh berdasarkan asumsi, bukan jaminan atau instruksi transaksi.

Fitur ini hanya mengubah berkas frontend (`index.html`, `styles.css`,
`js/*.js`, `sw.js`); jika backend dari tahap sebelumnya sudah aktif, tidak
perlu memperbarui `Code.gs` untuk memakai simulasi.

## 📅 Tagihan Terverifikasi dan Prioritas Lintas Bulan

Untuk pembaruan ini, salin `Code.gs` terbaru ke Apps Script dan terbitkan
**New version** pada deployment yang dipakai aplikasi **sebelum** merge
frontend. Sheet `Bills` otomatis mendapat kolom `Wallet`, `PaidAt`, dan `Id`
di sebelah kanan kolom lama. Tagihan lama tetap ada, memperoleh ID, dan
awalnya dianggap belum lunas; tidak ada tanggal pembayaran yang ditebak.
Periksa tanggal, nominal, dan dompet tagihan lama yang belum lengkap.

Saat membuat atau mengedit tagihan manual, Anda dapat memilih dompet dan
menandainya lunas. Di kalender, tombol **Tandai lunas** dan **Batalkan lunas**
memperbarui status pengingat. Status ini **tidak** membuat transaksi dan tidak
mengurangi saldo; catat pengeluaran yang benar lewat form Transaksi. Tagihan
yang sudah lunas tidak masuk komitmen tersisa dan prioritas. Tagihan manual
yang jatuh tempo dalam tujuh hari akan tampil meskipun tanggalnya masuk bulan
berikutnya. Tagihan sampai tujuh hari terlambat masih dapat ditindaklanjuti.
Jika tanggal dan nama prediksi langganan cocok dengan tagihan manual, aplikasi
memakai tagihan manual agar jumlahnya tidak terhitung dua kali. Dashboard
menampilkan hingga tiga tindakan paling mendesak, termasuk beberapa tagihan
jika memang itu yang paling mendesak.

## 💸 Bayar & Catat Tagihan

Salin `Code.gs` terbaru ke Apps Script dan terbitkan **New version** pada
deployment aplikasi **sebelum** menggabungkan pembaruan frontend. Migrasi
menambah kolom `BillId` di akhir sheet `Expenses`; transaksi lama tetap ada.
URL deployment yang aktif di `js/api.js` harus tetap menunjuk ke deployment
yang baru diperbarui.

Untuk tagihan manual yang belum lunas, pilih **Bayar & Catat** di prioritas
dashboard atau detail kalender. Isi tanggal pembayaran sebenarnya, nominal,
kategori, dan dompet, lalu konfirmasi. Aplikasi menambah satu pengeluaran
yang tertaut dengan tagihan dan menandainya lunas; saldo serta anggaran ikut
menghitung pengeluaran tersebut. Jika respons koneksi hilang, periksa dulu
riwayat transaksi. Mengirim pembayaran tagihan yang sama lagi tidak membuat
transaksi kedua. Jika Anda sebelumnya sudah menandai tagihan lunas atau
mencatat pengeluaran secara manual, cocokkan riwayat terlebih dahulu untuk
menghindari pencatatan ganda sebelum menggunakan fitur ini.

Transaksi yang tertaut bisa diedit lewat riwayat. Menghapusnya membuka kembali
tagihan dan mengembalikan pengaruh transaksi pada saldo dan laporan. Tagihan
yang memiliki pembayaran tertaut tidak dapat dibatalkan status lunasnya atau
dihapus sebelum transaksi pembayaran dihapus. Tombol **Tandai lunas** tetap
tersedia untuk mencatat status saja tanpa membuat transaksi.

## 💳 Pembayaran Kewajiban dan Tujuan Simulasi

Salin `Code.gs` dari pembaruan ini ke proyek Apps Script aktif dan terbitkan
**New version** sebelum menggabungkan perubahan frontend. Migrasi menambah
`Id` di `Debts`, serta `DebtId` dan `PrincipalPaid` di akhir `Expenses`.
Data lama dipertahankan. URL deployment aktif di `js/api.js` tidak diganti.

Dropdown **Tujuan Keuangan (Opsional)** di simulasi menampilkan tujuan yang
sudah dibuat pada bagian **Tujuan Keuangan**. Jika belum ada tujuan, hanya
**Tanpa tujuan** yang tampil. Tombol **+ Buat Tujuan** tersedia di dekat dropdown.

Pengeluaran pada kategori **Kewajiban & Utang** tetap mengurangi dompet seperti
biasa. Untuk mengurangi **Daftar Kewajiban**, pilih kewajiban terkait dan isi
bagian pembayaran yang mengurangi pokok berdasarkan tagihan resmi. Jika
pengeluaran sudah dicatat, buka **Riwayat Transaksi**, pilih transaksi tadi,
lalu tautkan dan simpan; **jangan membuat pengeluaran kedua**. Saldo kewajiban
yang ditampilkan adalah saldo awal dikurangi total pokok pembayaran tertaut.
Mengubah atau menghapus transaksi otomatis menghitung ulang saldo, dan Debt
Payoff memakai saldo terbaru. Bunga/biaya tetap tercatat sebagai pengeluaran,
tetapi tidak mengurangi pokok. Tidak ada riwayat lama yang otomatis dianggap
sebagai pembayaran hanya karena nama kategori cocok.

Saat menambah atau mengedit kewajiban, isi **cicilan minimum bulanan** dan
**bunga tahunan** agar Debt Payoff bisa mensimulasikan Snowball dan Avalanche.
Kalkulator ini hanya memproyeksikan jadwal, tidak membuat transaksi pembayaran.
FIRE Projection juga hanya simulasi berdasarkan asumsi pengeluaran, kontribusi,
modal, hasil investasi, inflasi, dan tingkat penarikan; tidak mencatat investasi.
