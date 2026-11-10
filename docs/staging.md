<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:54131f0ce276db7f6f6349c00a4893984e8fc4266423ba9952443a60f4497acb -->

# Checklist validasi staging sebelum installer diaktifkan

Gunakan VPS sekali pakai milik sendiri. Pengujian ini belum dilakukan pada tugas ini karena endpoint/kredensial staging belum tersedia. Jangan menggunakan VPS produksi. Tidak ada hasil di bawah yang boleh dianggap lulus dari unit test atau build.

## Profil dasar

- [ ] Ubuntu24.04 amd64/arm64 systemd, public IP terpasang langsung, Python3 dan passwordless sudo/root.
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