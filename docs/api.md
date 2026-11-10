<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d6a1cde4e293629da4833943628d9547edd4356447c986b71924b10bae619b49 -->

# Kontrak API versi 1

Base `/v1`. Semua mutasi JSON harus menyertakan `Origin` yang terdaftar; mutasi terautentikasi juga `X-CSRF-Token` dari `/session` atau response login/register. Browser memakai cookie HttpOnly dan credentials include. Tidak ada bearer user API pada versi ini. Error berupa `{error:string}` tanpa stack atau secret. HTTP400 validasi,401 sesi,403 policy,404 resource yang bukan milik pengguna,409 konflik,422 tujuan tidak aman,503 konfigurasi/gate/storage.

| Method | Path | Fungsi |
|---|---|---|
| GET | /health, /session, /workspace | Readiness, sesi dan snapshot workspace terisolasi tanpa credential; UI polling satu request |
| POST | /auth/register, /auth/login, /auth/logout | Akun dan sesi |
| POST | /auth/forgot-password, /auth/reset-password | Pengiriman reset dan token sekali pakai |
| POST | /auth/send-verification, /auth/verify-email | Verifikasi email |
| PATCH/DELETE | /me | Profil / hapus akun dengan password |
| POST | /me/password | Ganti password; revoke semua sesi |
| GET/DELETE | /sessions, /sessions/:id | Daftar/revoke sesi milik sendiri |
| GET | /overview, /activity | Ringkasan dan audit akun |
| GET/POST | /keys | Metadata / generate dengan consent |
| POST | /keys/:id/export | Ekspor private key setelah password confirmation |
| DELETE | /keys/:id | Hapus jika tidak dipakai server |
| POST | /connections/scan | {host,port}; scan fingerprint tanpa credentials |
| POST | /connections/test | Input server + probe/trust; pinned SSH + probe |
| GET/POST | /servers | Daftar / simpan hanya setelah test cocok |
| PATCH/DELETE | /servers/:id | Rename/deskripsi / keluarkan dari workspace |
| GET/POST/DELETE | /nodes, /nodes/:id | Metadata node milik akun |
| GET/POST/DELETE | /domains, /domains/:id | Metadata domain + resolusi DNS |
| POST | /domains/:id/verify | Live TLS chain/hostname/expiry dan DNS |
| GET/POST | /jobs | Daftar / queue config terenkripsi + idempotency |
| GET | /jobs/:id/events | SSE progress, cookie ownership, no-store |
| POST | /jobs/:id/cancel, /jobs/:id/retry | Safe cancellation / hanya retry read-only |
| GET | /admin, /admin/logs | Metadata sistem dan audit; administrator |
| PATCH | /admin/users/:id, /admin/settings | Suspend/resume akun, registrasi/maintenance |

Field request lengkap divalidasi di `backend/app.ts` dan `lib/contracts.ts`; UI menggunakan kontrak itu. Contoh job read-only: `{server_id:"owned-server-id",type:"diagnostics",config:{},idempotency_key:"random-unique-at-least-16-chars"}`. Job mutasi memerlukan confirmed:true di envelope serta consent:true di config; installer gate dan kompatibilitas diperiksa terpisah.

Endpoint internal worker `/claim`, `/heartbeat`, `/update` hanya tersedia loopback4001, memakai bearer worker.token privat, dan bukan API browser. Claim mengembalikan credential hanya untuk job yang ditugaskan. Epoch dan lease membatasi update. Jangan mengekspos endpoint ini melalui ingress publik.

SSE event `progress` berisi job safe tanpa config_secret. UI saat ini melakukan polling; konsumsi SSE opsional menggunakan EventSource dengan withCredentials:true pada origin yang diizinkan. Tidak ada secret dalam URL event. Reconnect menerima snapshot persisten terbaru, bukan replay semua stdout command.

## Profil OS installer

Config job `install_panel`, `install_wings`, `configure_wings` dan `upcloud_setup` menerima `os_profile: "ubuntu-22.04" | "ubuntu-24.04"`. Jika tidak dikirim, default tetap `ubuntu-24.04` untuk kompatibilitas request lama. Profil harus cocok dengan `evidence.os_id` dan `evidence.os_version` VPS; ketidakcocokan ditolak HTTP 422 sebelum queue, setelah pemeriksaan kepemilikan. Runner memeriksa ulang OS aktual sebelum operasi. UpCloud tetap hanya untuk provider UpCloud. Gate staging tetap berlaku.


<!-- /coderabbit-ai-generated:v1 -->