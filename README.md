<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c12a9646cfc38940e2ad4c19dc2859eafb864ad1e1e360a9f8a75c2f1b56020c -->

# ZetaInstall

Your VPS. Your Infrastructure. Installed Automatically.

ZetaInstall adalah aplikasi Next.js dengan API Fastify dan worker SSH terpisah. Dashboard memakai data milik akun yang sedang login; tidak ada VPS, status sukses, atau log contoh yang disisipkan sebagai data nyata.

## Jalankan lokal

Prasyarat: Node.js 24 LTS, npm 11, Linux; `ssh-keygen` diperlukan untuk pengujian interoperabilitas. Instal dependency dengan `npm ci`, lalu `npm run dev`. Buka http://localhost:3000. Perintah ini menjalankan web 3000, API loopback 4000, dan worker melalui endpoint internal loopback 4001. Tunggu `/api/health` menunjukkan API dan worker online.

Environment dibaca dari environment proses, bukan otomatis dari `.env` backend. Gunakan `.env.example` sebagai daftar konfigurasi; muat file privat memakai service manager atau shell sebelum menjalankan proses. Jangan commit konfigurasi privat. Default lokal membuat `.data/database.json` serta `.data/keys/` dengan permission terbatas. Pertahankan keduanya saat restart. Jangan gunakan folder ini di Vercel.

## Kemampuan yang tersedia

- Register, login/logout, profil, perubahan password, penghapusan akun, manajemen sesi, role administrator; forgot/reset password dan verifikasi email melalui SMTP atau Resend yang dikonfigurasi.
- SSH Key Manager: Ed25519/RSA4096, passphrase, public/private download, ekspor ulang dengan konfirmasi password, private key terenkripsi.
- Add VPS: 14 pilihan provider termasuk Other Provider, Universal dan UpCloud terpisah, scan fingerprint tanpa autentikasi, persetujuan identitas host, test SSH nyata, deteksi OS/resource/root dan penyimpanan hanya setelah test berhasil.
- Node metadata, domain/DNS, verifikasi sertifikat TLS nyata, job diagnostics/firewall dan audit log per pengguna.
- Antrean persisten, worker terpisah, progress tahap nyata, SSE API dan polling UI, deduplikasi, timeout, cancellation sebelum aksi, pemulihan lease dengan blokir perubahan sampai diagnostics selesai.
- Profil runner Panel 1.15.2, Wings 1.13.4, UpCloud direct/reverse proxy, operasi Certbot dan service repair dengan command allowlist.
- Seluruh halaman navigasi workspace dan dokumentasi 20 topik tersedia. Administrator dapat menangguhkan akun, melihat metadata sistem/antrean/log, dan mengatur registrasi serta maintenance.

## Status dan batas implementasi

**Belum dinyatakan production ready.** Installer perubahan remote diblokir secara default (`ENABLE_INSTALLERS=false`). Buka gate hanya setelah menjalankan checklist staging pada VPS sekali pakai. Belum ada pengujian Panel/Wings/UpCloud pada VPS nyata atau deployment publik dalam tugas ini.

Profil perubahan otomatis saat ini khusus Ubuntu 24.04, systemd, root atau passwordless sudo, RAM minimal 2 GiB dan disk bebas 10 GiB. Ini batas profil ZetaInstall, bukan klaim minimum resmi semua versi Pterodactyl. Provider tanpa IP publik yang terpasang langsung (NAT), OS lain, dan host non-systemd ditolak untuk perubahan otomatis. Semua provider tetap bisa ditambahkan bila koneksi SSH dan probe didukung. Probe memerlukan Python3, systemctl, ss dan akses root/sudo.

Panel fresh install menolak service/database/directory yang sudah ada dan mengharuskan PHP 8.3.36+. Konfigurasi Panel yang sudah ada menggunakan diagnostics dan panduan migrasi manual, bukan overwrite otomatis. Wings membutuhkan Docker Engine terpasang dari repository resmi dan konfigurasi YAML node asli. Konfigurasi Wings yang sudah ada ditolak agar token, volume dan TLS tidak tertimpa. Jika API Wings berhasil tetapi koneksi dari Panel belum diverifikasi, job tetap Failed dengan bukti bahwa instalasi telah diterapkan; jangan reinstall sembarangan.

Integrasi provider API/cloud-init, pembuatan node lewat Application API, penggantian konfigurasi existing secara otomatis, perubahan firewall, rotasi KMS, verifikasi Panel-to-Wings otomatis dan recovery lintas host belum diimplementasikan. Firewall eksternal provider ditandai unknown. SFTP dan port game tidak melewati HTTP reverse proxy. Tidak ada tombol yang mengklaim aksi ini sudah dilakukan.

Private key dibuat di backend dengan persetujuan eksplisit karena worker memerlukan key untuk pekerjaan tanpa browser. Ini managed custody; operator host yang memiliki vault key dan database dapat mengakses secret. Role administrator aplikasi tidak menyediakan akses private key pengguna lain. Browser-local key generation/KMS envelope encryption memerlukan fase tambahan.

## Verifikasi

```bash
npm run typecheck
npm test
npm run check:runner
npm run test:e2e
npm run build
npm audit --omit=dev
```

`npm run test:email` memerlukan emulator Resend lokal dan konfigurasi privat yang dijelaskan pada [deployment](docs/deployment.md). Tes inti tidak menghubungi alamat fixture SSH. `npm run test:e2e` memakai coderabbit-agent-browser pada sesi Chromium Preview yang sudah terdaftar dengan layanan web/API/worker aktif. Script menguji register, key download/OpenSSH, mobile navigation/axe, logout/login dan account deletion, lalu membersihkan akun sintetis. Tidak ada VPS yang dimutasi.

## Dokumentasi operator

- [Arsitektur dan database](docs/architecture.md)
- [Kontrak API](docs/api.md)
- [Deployment frontend/API/worker](docs/deployment.md)
- [Model keamanan](docs/security.md)
- [Backup dan pemulihan](docs/recovery.md)
- [Validasi staging](docs/staging.md)

Laporan riset tanggal 10 November 2026 beserta manifest sumber tersedia dalam Outputs tugas ZetaInstall. Versi installer dipin dan checksum diverifikasi. Tinjau ulang rilis/advisory resmi sebelum mengaktifkan instalasi pada lingkungan baru.


<!-- /coderabbit-ai-generated:v1 -->