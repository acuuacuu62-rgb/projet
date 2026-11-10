<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:adfb1ef730c5d236348ef4ff1416174e329458680360e5aeff7afecb4f63e607 -->

# Backup dan pemulihan

## Backup konsisten

Store menyimpan `database.previous.json` sebelum transaksi, snapshot setiap50 revisi di `DATA_DIR/backups/`, maksimum24 snapshot. Semua backup dibatasi permission0600. Sessions/auth_tokens serta config_secret job dibuang dari backup otomatis agar restore tidak menghidupkan reset link/sesi/grant lama. Secret SSH tetap terenkripsi. Backup otomatis lokal tidak melindungi dari kehilangan volume atau pencurian host.

Untuk backup off-host: tunggu job aktif selesai, hentikan worker lalu API. Salin database.json konsisten dan direktori backup ke storage terenkripsi off-host dengan retention yang disepakati. Cadangkan vault.key pada kanal/storage terpisah dengan akses sangat terbatas. Worker.token dapat dirotasi dengan API/worker berhenti; jangan masukkan token ini ke laporan. Backup tanpa vault key tidak dapat memulihkan credential. Jangan menyalin data aktif saat menulis tanpa snapshot filesystem yang konsisten.

## Database rusak atau write gagal

1. Hentikan penerimaan traffic dan kedua service. Jangan menghapus database lalu restart untuk menghasilkan database kosong.
2. Simpan salinan read-only dari file rusak untuk investigasi. Pastikan kapasitas disk, permission dan volume sehat. Lock stale diperiksa proper-lockfile; jangan membuka dua writer atau menghapus lock milik API yang masih hidup.
3. Pilih snapshot schema_version1 terakhir yang valid. Salin ke direktori restore baru privat bersama vault key yang cocok. Hapus sessions/auth_tokens dan config_secret job dari salinan restore; jangan mengedit satu-satunya backup.
4. Jalankan API terisolasi pada direktori restore dengan installers false. Store harus memvalidasi JSON tanpa reset. Cek jumlah akun/server, dekripsi key milik akun sintetis, login baru dan ownership.
5. Pending job yang grant-nya hilang akan menjadi Failed saat claim. Job dengan lease lama menjadi Failed/recovery_required; jangan mengganti status langsung Completed atau Pending. Jalankan diagnostics terhadap VPS sebelum persetujuan instalasi baru.
6. Setelah verifikasi, pindahkan salinan yang sehat ke volume utama secara atomik dengan service berhenti, mulai API lalu worker dan periksa health. Pertahankan backup lama sesuai retention.

## Worker/SSH terputus

Browser ditutup tidak menghentikan worker. API restart mempertahankan antrean. Lease45detik yang kedaluwarsa tidak diulang otomatis. Remote runner mungkin masih berjalan walau SSH putus; flock pada VPS menolak runner lain selama proses aktif. Tunggu proses/lock berakhir lalu periksa service/database/TLS. Diagnostics sukses menghapus flag recovery_required, bukan membatalkan perubahan yang sudah terjadi. Installer fresh menolak existing installation; rollback otomatis paket/database belum tersedia.

## Pterodactyl

Cadangkan database Panel dan `/var/www/pterodactyl/.env` terutama APP_KEY secara aman. Kehilangan APP_KEY dapat membuat data terenkripsi Panel tidak dapat dipulihkan. Cadangkan Wings config0600 dan data volume sebelum konfigurasi ulang. Tidak pernah menimpa config existing menggunakan token yang ditempel dari sumber tak tepercaya. Ikuti prosedur backup/restore resmi versi Panel/Wings yang dipakai dan uji pada staging.


<!-- /coderabbit-ai-generated:v1 -->