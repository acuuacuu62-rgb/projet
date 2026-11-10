<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:19ad9898e9a85118c49c431eb550091f3876f97529b54ee10f4323fe4f8886b4 -->

# Model keamanan dan batas kepercayaan

## Kontrol saat ini

Password Argon2id dengan memory19456KiB/time2. Sesi random256bit, hash SHA256 di store, cookie HttpOnly/SameSiteLax, Secure + prefix __Host di production; idle30 menit dan expiry absolut7hari. Endpoint mutasi mengharuskan origin tepat, JSON dan token CSRF sesi. Login/register/forgot/key/scan dibatasi laju; UI memproyeksikan resource berdasarkan pemilik, tidak mempercayai user_id request. Admin role tidak mempunyai endpoint ekspor key orang lain.

Vault XChaCha20-Poly1305 menggunakan nonce random24byte, key32byte terpisah, AAD user_id:purpose. Private SSH key, passphrase/password koneksi dan config job tidak plaintext di JSON. Public key/fingerprint bukan secret. Ekspor key memerlukan password akun dan audit event. Data aplikasi umum seperti email, IP, domain dan log metadata tidak terenkripsi per field; gunakan volume terenkripsi untuk enkripsi seluruh metadata saat diam. Belum ada KMS/envelope/key rotation dan tidak ada klaim perlindungan terhadap kompromi operator host.

Host key di-scan sebelum autentikasi dan pengguna wajib membandingkan fingerprint melalui provider console/kanal independen. Scan itu sendiri belum membuktikan identitas. Koneksi berikutnya memakai fingerprint exact dan IP publik yang dipin; perubahan IP/host key ditolak, tidak menerima otomatis. Tujuan private, reserved, loopback, metadata dan IPv6-mapped diblokir; seluruh jawaban DNS diperiksa. Mendukung private-network VPS memerlukan arsitektur agent/jaringan khusus, bukan menonaktifkan filter global.

Runner hanya fixed Python yang disertakan release. Config JSON masuk stdin, subprocess argv tanpa shell interpolation pengguna; domain, email, port, YAML dan action divalidasi. Daftar repair service terbatas. Secret tidak di argv/log; output command ditahan dan event hanya menjelaskan tahap. Tidak ada arbitrary terminal, script upload atau curl|bash. Paket/artifact resmi dipin/checksum; ini tidak menggantikan pemeriksaan advisory sebelum rilis.

TLS client memverifikasi chain dan hostname. Nginx UpCloud proxy memverifikasi upstream TLS dengan SNI FQDN dan trust store; SFTP terpisah. Existing TLS/config ditolak sebelum overwrite. Firewall tidak diubah otomatis; akses SSH/recovery tetap menjadi prasyarat operasi berisiko di masa depan. Provider firewall tidak disimpulkan dari UFW.

## Risiko yang masih terbuka

- Installer belum diuji pada VPS staging; jangan aktifkan mutasi di produksi.
- Managed SSH custody menempatkan operator backend dalam trust boundary. Root VPS dibutuhkan runner; hanya izinkan host yang pemiliknya menyetujui pengelolaan.
- Backend satu host/satu writer; tidak ada HA, distributed queue, akun organisasi, MFA, KMS atau Postgres.
- Backup historis dapat berisi credential terenkripsi yang sudah dihapus dari database aktif sampai retention berakhir. Deletion menghapus data aktif, tidak membatalkan public key di VPS atau menghapus salinan private key yang pernah diunduh. Kebijakan retention perlu ditetapkan operator.
- Input schema dasar file JSON bukan pengganti constraint relasional penuh. Restore harus diperiksa sebelum menerima traffic.
- Content Security Policy nonce dan audit keamanan independen belum diselesaikan. HTTP security headers dasar tersedia; reverse proxy harus menerapkan TLS/HSTS setelah domain terverifikasi. Request logging Next.js development dimatikan agar query token reset tidak masuk log; operator ingress juga harus meredaksi query reset/verification pada access log.

## Respons insiden

Blokir mutasi/maintenance, hentikan worker secara aman, revoke sessions lewat password reset atau kontrol akun, isolasi backend dan simpan bukti terbatas. Jika vault key bocor, anggap SSH keys/password koneksi ikut berisiko; rotasi akses pada setiap VPS dari recovery console, bukan sekadar mengganti file vault.key. Penggantian vault.key tanpa re-encryption membuat data tidak dapat dibuka. Uji pemulihan dari backup sebelum menghidupkan kembali antrean.


<!-- /coderabbit-ai-generated:v1 -->