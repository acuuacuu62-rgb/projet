<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ff12764d0080b1f45ed1d482bcbfe053f1db10a79016285f4c6be3ace41a6fa6 -->

# Checklist validasi staging sebelum installer diaktifkan

Gunakan VPS sekali pakai milik sendiri. Pengujian ini belum dilakukan pada tugas ini karena endpoint/kredensial staging belum tersedia. Jangan menggunakan VPS produksi. Tidak ada hasil di bawah yang boleh dianggap lulus dari unit test atau build.

## Profil dasar

- [ ] Jalankan seluruh matriks secara terpisah pada Ubuntu 22.04 dan 24.04, amd64/arm64, systemd, IP publik terpasang langsung, Python3 dan passwordless sudo/root.
- [ ] Ubuntu 22.04: PPA ondrej/php ditambahkan dengan apt signature verification aktif; PHP 8.3.36+ dan Composer 2 tersedia. Ubuntu 24.04: tidak ada penambahan PPA tersebut.
- [ ] Profil yang tidak cocok dengan OS aktual ditolak sebelum apt; perubahan OS sejak probe juga ditolak worker.
- [ ] Composer, Artisan, cron dan pteroq memakai /usr/bin/php8.3 meskipun php default host adalah 8.1.
- [ ] Bandingkan SSH fingerprint via provider console; test key benar/salah, host key mismatch, IP berubah dan sudo ditolak.
- [ ] Probe OS/architecture/RAM/CPU/disk/package manager dibandingkan output console.
- [ ] DNS A dan AAAA seluruhnya tepat, public80/443 tersedia, firewall eksternal dan lokal diperiksa terpisah.
- [ ] Panel1.15.2 pada fresh VPS, dependency patch PHP8.3.36+, artifact checksum, admin login nyata, database/Redis/queue/cron, HTTPS dan scheduler setelah reboot.
- [ ] Wings1.13.4 kedua arsitektur dengan Docker resmi, YAML node, systemd/API authenticated, SFTP login dari client, Panel-to-Wings dan game allocations.
- [ ] UpCloud direct dan reverse proxy443→loopbackTLS, upstream hostname verification aktif, public firewall serta SFTP terpisah.
- [ ] Sertifikat existing tidak tertimpa, issue gagal aman pada DNS/port konflik, renew diperiksa dari tanggal/serial aktual dan service membaca sertifikat terbaru.
- [ ] Paket gagal/network timeout/SSH putus/reboot/APIworker restart, recovery flag dan remote flock, tidak ada blind retry atau sukses palsu.
- [ ] Cancel Pending, cancel sebelum aksi dan permintaan cancel saat apt/migrasi berjalan; jelaskan batas cancellation.
- [ ] Backup/restore corrupt JSON, disk full, vault key tidak cocok, retention; tidak ada sesi/token/grant lama aktif setelah restore.
- [ ] Dua user cross-access semua resource/SSE/export, CSRF/Origin, session expiry/suspension, SSRF DNS rebinding, command injection/YAML alias dan secret redaction.
- [ ] SMTP produksi, reset/verifikasi sekali pakai, TLS API/browser, CORS same-site custom domains, mobile/a11y, deployment health publik.

Hanya setelah bukti tersimpan: set ENABLE_INSTALLERS=true pada API dan restart terkontrol. Gate ini adalah release safeguard, bukan bukti bahwa profil sudah lulus.

<!-- /coderabbit-ai-generated:v1 -->