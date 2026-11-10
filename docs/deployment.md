<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:273f8dbc74d95add1b6a0345c55660cf66efaa303a787ae3ccac08053f710059 -->

# Panduan deployment

## Prasyarat dan pemisahan proses

Gunakan frontend Next.js di Vercel, API dan worker pada Linux server persisten dengan Node24 LTS/npm11. Vercel hanya frontend; jangan menjalankan SSH atau file database sebagai serverless function. Versi ini satu API writer dan worker pada host yang sama. Data/keys harus di volume persisten, di luar source release. Belum ada deployment publik yang diverifikasi pada tugas ini.

1. Instal dependency release dengan `npm ci` pada direktori source. `tsx` adalah runtime dependency yang diperlukan API/worker.
2. Siapkan service account non-root `zetainstall` dan direktori `/var/lib/zetainstall`, `/var/lib/zetainstall-keys` mode0700 milik account itu. Pisahkan backup vault key dari backup database.
3. Buat file environment privat `/etc/zetainstall.env` mode0600. Isi `DATA_DIR=/var/lib/zetainstall`, `KEY_DIR=/var/lib/zetainstall-keys`, `APP_ORIGIN=https://app.example.com`, `ALLOWED_ORIGINS=https://app.example.com`, `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=4000`, `INTERNAL_PORT=4001`, `ENABLE_INSTALLERS=false`. Tambahkan SMTP_URL/MAIL_FROM atau Resend provider yang sah.
4. Adaptasi unit contoh di `deployment/` untuk path instalasi dan Node binary sebenarnya. API dan worker memakai user sama; worker perlu membaca worker.token. Jalankan API, periksa readiness, kemudian worker. Service manager melakukan restart.
5. Pasang reverse proxy HTTPS tepercaya untuk `api.example.com` ke loopback4000. Publikasikan hanya `/v1/`; jangan meneruskan port4001 atau file volume. Matikan buffering SSE dan batasi ukuran request256KiB. API menjalankan Origin/CSRF sendiri dan tidak mempercayai X-Forwarded-For; rate limit per IP pada API dapat berbagi kuota di belakang proxy. Tambahkan pembatasan edge yang memahami IP tepercaya sebelum deployment berskala.
6. Di Vercel pilih Next.js, build `npm run build`, set `NEXT_PUBLIC_API_URL=https://api.example.com/v1` saat build. Pasang custom domain `app.example.com` dan TLS. Default localhost rewrite hanya untuk dev. Frontend dan API harus same-site dengan domain induk sama untuk cookie Lax; origin Vercel sementara dengan API domain berbeda bukan deployment auth yang didukung.
7. Akses frontend dan `/v1/health` melalui HTTPS publik. Pastikan API/worker online, storage persistent, email configured. Register owner. Untuk role admin, hentikan API sementara lalu jalankan `DATA_DIR=/var/lib/zetainstall npm run admin -- owner@example.com` sebagai user service, kemudian hidupkan API. Tidak ada password admin default.
8. Uji register/login/logout, CSRF, email verification/reset, key download, DNS/TLS, dan restore backup. Jalankan seluruh checklist staging sebelum menyalakan gate installer. Jangan menyebut deployment selesai dari hasil build saja.

## Email

SMTP: isi `SMTP_URL` URL smtps yang valid dan `MAIL_FROM`. Resend: isi `RESEND_API_KEY`, `MAIL_FROM` domain yang terverifikasi, dan biarkan `RESEND_BASE_URL=https://api.resend.com`. Link berasal dari APP_ORIGIN, bukan Host request. Token berumur30 menit, hash di database dan sekali pakai. Tanpa provider, UI menyatakan email belum dikonfigurasi; aplikasi tidak menyisipkan link reset ke log.

Integrasi lokal telah diuji dengan emulator resmi CodeRabbit release v0.0.1 untuk Resend. File privat `$HOME/runtime/emulate-config/zetainstall-email.json` berisi `{RESEND_API_KEY,RESEND_BASE_URL,MAIL_FROM}` untuk fixture sintetis. Jalankan emulator `node "$HOME/runtime/emulate/v0.0.1/dist/index.js" start --service resend --port 4020`, lalu `npm run test:email`. Konfigurasi ini hanya untuk tes; jangan pakai credential provider asli atau mengalihkan koneksi agent ke emulator. Instalasi emulator tidak diperlukan untuk penggunaan produksi.

## Health dan observability

GET `/v1/health` menguji readiness API/storage dan heartbeat worker; HTTP503 saat storage memerlukan recovery. Ini tidak membuktikan VPS, DNS publik, SMTP atau installer berhasil. Job history/audit memuat bukti per operasi. Pantau ukuran disk/database, backlog, Failed jobs, offline heartbeat, backup age dan expiry sertifikat. Log proses tidak boleh memuat environment atau HTTP body.

## Upgrade

Backup konsisten + vault key terpisah, hentikan worker setelah job selesai, hentikan API, deploy release/lockfile yang ditinjau, jalankan tests/build, mulai API lalu worker, uji health/auth. Belum ada migrator schema_version selain1; perubahan skema memerlukan migrasi eksplisit dengan dry run dan restore test. Jangan otomatis memakai release Pterodactyl terbaru tanpa memperbarui checksum dan staging.


<!-- /coderabbit-ai-generated:v1 -->