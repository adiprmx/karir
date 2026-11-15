/* Kamus antarmuka Karir: Indonesia (id) dan Inggris (en).
 * Data perusahaan tetap Bahasa Indonesia; yang diterjemahkan hanya
 * chrome antarmuka (navigasi, judul, tombol, label). Bahasa dipilih
 * lewat cookie `karir-locale` (diatur rute /api/locale), default id. */
import { cookies } from "next/headers";

const DICT = {
  id: {
    "nav.home": "Beranda",
    "nav.search": "Cari",
    "nav.dashboard": "Dasbor",
    "nav.lamaran": "Lamaran",
    "nav.mulai": "Mulai",
    "nav.about": "Tentang",
    "nav.method": "Metode",
    "nav.faq": "FAQ",
    "nav.changelog": "Perubahan",
    "header.count": "{n} perusahaan",
    "footer.note":
      "Data dicek berkala langsung di browser; tiap perusahaan mencatat tanggal cek terbarunya. Lowongan bisa berubah setelah tanggal cek, selalu periksa portal resminya.",
    "footer.privacy":
      "Masuk akun itu pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap bisa dipakai. Kalau masuk, yang tersimpan di akun hanya email, kata pencarian, dan tanda lamaran, dan hanya pemilik akun dan admin yang bisa melihatnya. Tanpa masuk, tidak ada nama atau identitas yang tersimpan; kata pencarian hanya dicatat tanpa nama untuk statistik kunjungan.",
    "footer.repo": "Repo GitHub",
    "footer.method": "Metode pengecekan",
    "footer.about": "Tentang Karir",
    "footer.faq": "Pertanyaan umum",
    "footer.support": "Dukungan",
    "footer.changelog": "Riwayat perubahan",
    "footer.map": "Peta",
    "footer.settings": "Pengaturan",
    /* --- W-P0-08 (kebijakan privasi + syarat penggunaan): hanya kunci
     * baru di blok ini, nilai kunci lama tidak diubah. --- */
    "footer.privacyPolicy": "Kebijakan Privasi",
    "footer.terms": "Syarat Penggunaan",
    /* --- akhir W-P0-08 --- */
    /* --- W1-B1 (strip foto Beranda, LAND-08): teks alt ketiga foto.
     * Hanya kunci baru di blok ini, nilai kunci lama tidak diubah. --- */
    "landing.photoAltWarehouse": "Pekerja mengangkat kardus di dalam gudang",
    "landing.photoAltProduction":
      "Pekerja memeriksa mesin di lini produksi",
    "landing.photoAltCleaning": "Petugas cleaning membersihkan lantai",
    /* --- akhir W1-B1 --- */
    /* --- T18 --- */
    /* Detail perusahaan (DET-05): portal tidak bisa dibuka. Hanya kunci
     * baru di blok ini, nilai kunci lama tidak diubah. */
    "detail.portalDown":
      "Portal ini tidak bisa dibuka saat terakhir dicek. Tautan di bawah tetap bisa dicoba.",
    "detail.tryPortalAnyway": "Tetap coba buka portal",
    /* --- akhir T18 --- */
    /* --- T2 (pencarian: filter kota, kelompok hasil, bagikan hasil):
     * hanya kunci baru di blok ini, nilai kunci lama tidak diubah. --- */
    "search.city": "Kota",
    "search.allCities": "Semua kota",
    "search.groupCompanies": "Perusahaan ({n})",
    "search.groupRoles": "Lowongan ({n})",
    "search.share": "Bagikan hasil ini",
    "search.shareCopied": "Tautan disalin.",
    "search.shareFailed": "Tautan tidak bisa disalin otomatis. Salin alamat di bilah browser.",
    /* --- akhir T2 --- */
    /* --- T1f (tombol salin kanal di halaman detail): hanya kunci baru
     * di blok ini, nilai kunci lama tidak diubah. --- */
    "detail.copyChannel": "Salin",
    "detail.channelCopied": "Disalin.",
    "detail.channelCopyFailed":
      "Tidak bisa disalin otomatis. Salin manual dari layar.",
    "detail.copyWa": "Salin nomor WhatsApp",
    "detail.copyEmail": "Salin alamat email",
    /* --- akhir T1f --- */
    /* --- T13 (aksesibilitas: tautan tab baru, toast, pesan tanpa-JS,
     * hitungan hasil target): hanya kunci baru di blok ini, nilai
     * kunci lama tidak diubah. --- */
    "common.newTab": "(membuka tab baru)",
    "common.toastClose": "Tutup pemberitahuan",
    "common.noJs":
      "JavaScript tidak aktif di browser ini. Pencarian dari Beranda tetap bisa dipakai, tetapi Lamaran, Mulai, dan Pengaturan butuh JavaScript.",
    "home.targetsShown": "Menampilkan {n} perusahaan",
    "search.noJsFilters":
      "Filter status, urutan, dan tombol lainnya butuh JavaScript.",
    /* --- akhir T13 --- */
    "landing.trustDead": "portal tidak bisa dibuka",
    "landing.problem1":
      "Kanal karir perusahaan berserakan di mana-mana, dan susah membedakan mana portal resmi dan mana bukan.",
    "landing.problem2":
      "Lowongan yang disalin dari satu situs ke situs lain sering sudah basi atau palsu.",
    "landing.freshLabel": "Terakhir dicek ulang {date}",
    "landing.freshOk": "Segar",
    "landing.freshStale": "Sudah lama, perlu dicek ulang",
    "landing.changesTitle": "Yang berubah",
    "landing.photoWarehouse": "Helper Gudang",
    "landing.photoProduction": "Operator Produksi",
    "landing.photoCleaning": "Cleaning Service",
    "landing.featureMapDesc":
      "Lihat {n} perusahaan yang ada lowongan di peta, dikelompokkan per kota.",
    "landing.faqTitle": "Pertanyaan umum",
    "landing.faq1q": "Bagaimana cara memakai Karir?",
    "landing.faq1a":
      "Ketik domisili dan posisi di Beranda, lalu lihat kanal yang paling cocok. Buka portal resminya dari hasil, baca syarat lengkapnya, dan lamar lewat kanal resmi.",
    "landing.faq2q": "Apakah Karir gratis?",
    "landing.faq2a":
      "Ya, gratis. Tidak ada biaya. Masuk akun itu pilihan, bukan kewajiban. Tanpa masuk pun semua fitur tetap bisa dipakai.",
    "landing.faq3q": "Bagaimana data dicek?",
    "landing.faq3a":
      "Kanal karir resmi tiap perusahaan dibuka langsung di browser, dan tanggal cek terakhirnya dicatat, supaya kamu tahu seberapa baru datanya.",
    "landing.faqMore": "Lihat semua pertanyaan",
    "home.title": "Lowongan yang dicek, bukan yang dicopas.",
    "home.intro": "{n} kanal karir resmi, dicek langsung di browser.",
    "home.domisili": "Domisili",
    "home.domisiliPh": "mis. Bogor, Depok, Cibinong",
    "home.posisi": "Posisi",
    "home.posisiPerusahaan": "Posisi/perusahaan",
    "home.posisiPh": "mis. Helper Gudang",
    "home.searchBtn": "Cari loker",
    "home.targets": "Lowongan terverifikasi",
    "home.targetsHeading": "{n} perusahaan punya lowongan yang kamu cari",
    "home.freshNote":
      "{count} perusahaan dicek dalam 7 hari terakhir, terakhir {date}. Lowongan bisa berubah setelah tanggal cek.",
    "search.title": "Cari kanal karir",
    "search.category": "Kategori",
    "search.allCategories": "Semua kategori",
    "search.status": "Status",
    "search.allStatuses": "Semua status",
    "search.order": "Urutan",
    "search.orderRelevance": "Paling relevan",
    "search.orderName": "Nama A-Z",
    "search.submit": "Cari",
    "search.reset": "Atur ulang",
    "search.sortNote":
      "Hasil diurutkan berdasarkan kecocokan posisi, domisili, dan status verifikasi.",
    "search.domisiliPh": "Misal: Depok",
    "search.posisiPh": "Misal: Administrasi atau PGN",
    "search.showing": "Menampilkan {a} dari {b} perusahaan",
    "search.noPositionMatch":
      "Tidak ada kecocokan posisi di data kami. Hasil di bawah ini adalah rekomendasi kanal berdasarkan domisili dan status, bukan lowongan yang terverifikasi.",
    "search.loadMore": "Tampilkan lebih banyak",
    "search.resultsLabel": "Hasil pencarian",
    "search.metaTitle": "Cari",
    "dash.title": "Dasbor data",
    "dash.byStatus": "Sebaran status",
    "dash.recheck": "Perlu dicek ulang",
    "dash.numbersNote":
      "Semua angka dihitung langsung dari data {n} perusahaan. Tidak ada angka contoh.",
    "dash.topCategories": "{n} kategori teratas",
    "dash.targetCompanies": "Perusahaan yang ada lowongan",
    "dash.andMore": "dan {n} lainnya di data perusahaan.",
    "dash.metaTitle": "Dasbor",
    "detail.portalBtn": "Buka portal karir",
    "detail.share": "Bagikan",
    "detail.copied": "Tautan disalin.",
    "detail.related": "Perusahaan sejenis",
    "detail.report": "Kirim laporan",
    "detail.reportSent":
      "Laporan terkirim. Terima kasih. Laporanmu akan diperiksa dan diperbaiki bila benar — tidak ada balasan langsung.",
    "detail.checked": "Terakhir dicek",
    "detail.location": "Lokasi",
    "detail.positions": "Posisi tercatat",
    "detail.notes": "Catatan pengecekan",
    "detail.category": "Kategori",
    "common.back": "Kembali",
    "common.loading": "Memuat…",
    "common.seedNote": "Menampilkan data cadangan. Data terbaru akan muncul lagi begitu layanan data pulih.",
    "common.notListed": "Tidak tercantum",
    "nav.map": "Peta",
    "nav.menu": "Menu",
    "nav.settings": "Pengaturan",
    "nav.theme": "Ganti tema terang atau gelap",
    "hero.rolesLabel": "Posisi populer",
    "dash.statusQuestion": "Dari {n} kanal, apa hasil cek-nya?",
    "hero.vizQuestion": "Dari {n} kanal, berapa yang cocok denganmu?",
    "hero.vizIdle": "{a} dari {b} kanal ada lowongan.",
    "hero.vizMatch": "{a} dari {b} kanal cocok dengan pencarianmu.",
    "hero.vizVerified": "{n} di antaranya lowongan terverifikasi.",
    "hero.vizLoading": "Memuat {n} kanal…",
    "hero.vizError": "Kanal belum bisa dimuat. Tombol Cari tetap berfungsi.",
    "hero.legendTarget": "Ada lowongan",
    "hero.legendMatch": "Cocok",
    "hero.legendOther": "Kanal lain",
    "hero.top": "Hasil teratas",
    "hero.seeAll": "Lihat semua {n} hasil",
    "hero.recent": "Terakhir kamu cari",
    "home.targetsLead": "Lowongan terverifikasi",
    "home.proofTitle": "Dicek langsung, bukan disalin dari situs lain.",
    "home.proof1": "kanal karir resmi dibuka dan dicek langsung di browser",
    "home.proof2": "ada lowongan di antaranya",
    "home.proof3": "Tiap baris mencatat tanggal cek, jadi kamu tahu seberapa segar datanya.",
    "home.changesEmpty": "Belum ada perubahan tercatat. Pengecekan ulang berjalan tiap hari pukul 01.00 WIB.",
    "home.changesError": "Daftar perubahan belum bisa dimuat.",
    "home.changesDegraded":
      "Daftar perubahan sedang tidak bisa dimuat. Coba lagi nanti.",
    "home.changesLoading": "Memuat perubahan…",
    "home.shareTargets": "Bagikan daftar lowongan",
    "home.printTargets": "Cetak daftar lowongan",
    "search.matchCount": "{m} cocok dengan pencarianmu.",
    "search.filters": "Filter",
    "search.apply": "Tampilkan hasil",
    "search.empty": "Tidak ada perusahaan yang cocok.",
    "search.emptyHint": "Coba ubah atau atur ulang filter untuk melihat semua perusahaan.",
    "search.loading": "Memuat kanal…",
    "search.error": "Data perusahaan tidak bisa dimuat.",
    "search.retry": "Coba lagi",
    "search.verifyNote": "Peran ini belum terverifikasi di data kami, cek langsung di portalnya.",
    "search.open": "Buka portal",
    "search.mark": "Tandai",
    "search.unmark": "Lepas tanda",
    "detail.explain": "Arti status",
    "detail.reportHint": "Ada yang salah? Laporkan masalah",
    "detail.noLink": "Perusahaan ini tidak punya tautan karir yang ditemukan.",
    "detail.daysAgo": "{n} hari lalu",
    "detail.today": "hari ini",
    "detail.deadline": "Batas lamar",
    "detail.daysLeft": "{n} hari lagi",
    "detail.deadlinePassed": "Sudah lewat",
    "detail.noPositions": "Tidak ada posisi terlihat",
    "detail.noNotes": "Tidak ada catatan.",
    "detail.noRelated": "Belum ada perusahaan sejenis dalam kategori ini.",
    "detail.applyChannels": "Cara lain melamar",
    "detail.emailHrd": "Email HRD",
    "detail.waHrd": "WhatsApp HRD",
    "detail.otherChannels": "Kanal lain",
    /* --- W1-TRACKER (DASH-08): hanya kunci baru di blok ini, nilai
     * kunci lama tidak diubah. --- */
    "dash.viewOnMap": "Lihat di peta",
    /* --- akhir W1-TRACKER --- */
    /* --- W2b (SEO + berbagi + penanda seed, Fase 5): hanya kunci baru
     * di blok ini, nilai kunci lama tidak diubah. --- */
    "footer.feed": "Umpan RSS",
    "home.shareKarirTitle": "Bantu temanmu menemukan lowongan yang benar",
    "home.shareKarirText":
      "Bagikan Karir ke teman yang sedang mencari kerja. Gratis, tanpa daftar.",
    "home.shareKarir": "Bagikan Karir",
    "home.shareKarirMsg":
      "Karir — lowongan yang dicek, bukan yang dicopas. Cari kanal karir resmi di {url}",
    "home.shareTargetsMsg":
      "Lowongan di Karir ({n} perusahaan ada lowongan): {url}",
    "search.emptyHelp": "Baca cara data dicek di halaman Metode",
    "search.metaDescription":
      "Cari kanal karir resmi perusahaan Indonesia berdasarkan domisili, posisi, kategori, kota, dan status. Hasil diurutkan dari yang paling cocok.",
    "dash.metaDescription":
      "Angka data Karir: sebaran status kanal, kategori terbanyak, dan perusahaan yang ada lowongan — semua dihitung langsung dari data.",
    "detail.shortenerNote":
      "Tautan ini memakai pemendek, jadi tujuan akhirnya tidak terlihat dari tautannya. Periksa dulu bahwa halaman tujuannya memang milik perusahaan ini sebelum mengisi data apa pun.",
    /* --- akhir W2b --- */
    /* --- W2a (copy & i18n, Fase 5 Gelombang 2): hanya kunci baru di
     * blok ini. Nilai kunci lama yang diubah untuk temuan UX-10,
     * UX-12, DUKUNG-06, dan DUKUNG-07 dicatat di laporan w2-a.md. --- */
    "common.all": "Semua",
    "common.new": "Baru",
    "common.close": "Tutup",
    "common.cancel": "Batal",
    "common.delete": "Hapus",
    "common.deleteConfirm": "Ya, hapus",
    "error.title": "Ada yang tidak beres.",
    "error.message":
      "Halaman ini tidak bisa dimuat. Periksa koneksi lalu coba lagi.",
    "notfound.title": "Halaman tidak ditemukan",
    "notfound.lede":
      "Alamat yang kamu buka tidak ada di Karir. Mungkin tautannya salah ketik, atau halamannya sudah tidak ada.",
    "detail.noCheckDate": "Belum ada tanggal cek.",
    "detail.reportFailed":
      "Laporan gagal terkirim. Periksa koneksi lalu coba lagi.",
    "detail.reportTooSoon":
      "Laporan baru saja dikirim. Tunggu {n} detik sebelum mengirim lagi.",
    "detail.reportSessionLimit":
      "Batas laporan untuk sesi ini tercapai (5 laporan). Coba lagi nanti.",
    "detail.reportTypeLabel": "Jenis masalah",
    "detail.reportReasonLabel": "Jelaskan masalahnya",
    "detail.reportTypeDead": "Tautan mati",
    "detail.reportTypeWrong": "Data salah",
    "detail.reportTypeOther": "Lainnya",
    "detail.reportPhDead": "Misal: halaman tidak bisa dibuka",
    "detail.reportPhWrong": "Misal: nama perusahaan salah tulis",
    "detail.reportPhOther": "Misal: lowongan ini terlihat mencurigakan",
    "search.matchPosition": "Posisi cocok",
    "search.matchLocation": "Lokasi cocok",
    "tracker.marked": "{name} ditandai.",
    "tracker.view": "Lihat",
    "tracker.saveRefused":
      "Browser menolak menyimpan. Coba keluar dari mode privat.",
    "tracker.unmarked": "Tanda dilepas.",
    "tracker.inProgress":
      "Lamaran ini sudah berprogres. Ubah dari halaman Lamaran.",
    "tracker.saved": "Tersimpan di browser ini.",
    "tracker.saveFailed": "Browser menolak menyimpan.",
    "tracker.deleted": "Dihapus dari lamaran.",
    "tracker.title": "Lamaran saya",
    "tracker.loading": "Memuat pelacak lamaran",
    "tracker.statusLabel": "Status lamaran",
    "tracker.dateLabel": "Tanggal",
    "tracker.noteLabel": "Catatan",
    "tracker.notePlaceholder": "Catatan untuk dirimu sendiri",
    "tracker.remove": "Hapus dari lamaran",
    "tracker.deleteTitle": "Hapus lamaran ini?",
    "tracker.deleteMessage": "Lamaran ke {name} akan dihapus dari daftar.",
    "tracker.hint": "Ketuk satu status untuk mulai melacak perusahaan ini.",
    "sync.saved": "Tersimpan di browser ini dan di akun.",
    "sync.sending": "Mengirim ke akun...",
    "sync.pending": "Ada perubahan yang belum terkirim ke akun.",
    "sync.offline":
      "Tidak ada internet. Perubahan tersimpan di perangkat ini dan akan dikirim saat tersambung lagi.",
    "sync.busy":
      "Server sedang sibuk. Perubahan tersimpan di perangkat ini dan akan dikirim nanti.",
    "sync.session":
      "Sesi akun berakhir. Masuk lagi supaya lamaran tersimpan ke akun.",
    "sync.denied":
      "Akun tidak diizinkan menyimpan. Perubahan tersimpan di perangkat ini.",
    "sync.failed":
      "Sinkron ke akun gagal. Perubahan tersimpan di perangkat ini.",
    "sync.guest":
      "Tersimpan di browser ini saja. Masuk dari menu untuk menyimpan ke akun juga.",
    "lamaran.title": "Lamaran Saya",
    "lamaran.lede": "Perusahaan yang kamu tandai dan lamar.",
    "lamaran.ledeAccount": "Tersimpan di perangkat ini dan di akun kamu.",
    "lamaran.loading": "Memuat lamaran…",
    "lamaran.retrySync": "Sinkronkan lagi",
    "lamaran.lastSynced": "Terakhir disinkronkan {time}.",
    "lamaran.guestBanner":
      "Perangkat ini punya {n} lamaran yang belum masuk akun.",
    "lamaran.mergeGuest": "Gabungkan ke akun",
    "lamaran.or": "atau",
    "lamaran.leaveAlone": "biarkan saja",
    "lamaran.filterLabel": "Saring lamaran",
    "lamaran.emptyTitle": "Belum ada lamaran yang dilacak.",
    "lamaran.emptyHint":
      "Ketuk ikon tanda di kartu perusahaan, atau cari dulu perusahaan yang mau dilamar.",
    "lamaran.searchCompanies": "Cari perusahaan",
    "lamaran.noStatus": "Tidak ada lamaran berstatus “{status}”.",
    "lamaran.viewAll": "Lihat semua",
    "lamaran.companyNo": "Perusahaan No. {n}",
    "lamaran.openPortal": "Buka portal karir {name} (membuka tab baru)",
    "lamaran.notInData": "Perusahaan ini tidak lagi ada di data.",
    "lamaran.statusLabel": "Status",
    "lamaran.namesFailed": "Nama perusahaan belum bisa dimuat.",
    "lamaran.statusChanged": "Status {name} diubah menjadi {status}.",
    "lamaran.statusChangedUnknown":
      "Status lamaran diubah menjadi {status}.",
    "lamaran.syncOk": "Lamaran sudah sinkron dengan akun.",
    "lamaran.syncFail": "Belum bisa sinkron. Coba lagi nanti.",
    "lamaran.mergeOk": "Lamaran digabungkan ke akun.",
    "lamaran.mergeFail": "Gabungkan gagal. Coba lagi nanti.",
    "mulai.lede":
      "Karir mengumpulkan kanal lowongan resmi perusahaan. Jawab dua hal di bawah ini, lalu lihat kanal yang paling cocok denganmu.",
    "mulai.loadingChoices": "Memuat pilihan",
    "mulai.currentChoices": "Pilihanmu saat ini",
    "mulai.notFilled": "Belum diisi",
    "mulai.viewMatches": "Lihat lowongan yang cocok",
    "mulai.editChoices": "Ubah pilihan",
    "mulai.clearChoices": "Hapus pilihanku",
    "mulai.savedLocal":
      "Pilihanmu tersimpan di browser ini saja, tidak dikirim ke mana pun.",
    "mulai.clearTitle": "Hapus pilihanmu?",
    "mulai.clearMessage":
      "Domisili dan posisi yang tersimpan akan dihapus dari browser ini.",
    "mulai.wizardLabel": "Tiga langkah singkat",
    "mulai.stepOf": "Langkah {n} dari 3",
    "mulai.whereLive": "Di mana kamu tinggal?",
    "mulai.whatRole": "Posisi apa yang kamu cari?",
    "mulai.posisiPh": "mis. Helper Gudang, Cleaning Service",
    "mulai.matchedChannels": "kanal cocok",
    "mulai.verifiedAmong": "{n} di antaranya lowongan terverifikasi.",
    "mulai.topThree": "Tiga yang paling cocok",
    "mulai.countError":
      "Jumlah kanal belum bisa dihitung, tetapi tombol di bawah tetap berfungsi.",
    "mulai.fillOne":
      "Isi salah satu untuk melihat jumlah kanal yang cocok.",
    "mulai.skip": "Lewati",
    "mulai.next": "Lanjut",
    "mulai.saveFailed": "Pilihan tidak bisa disimpan di browser ini.",
    "mulai.clearFailed": "Pilihan tidak bisa dihapus. Coba lagi.",
    "settings.lede": "Yang tersimpan di browser ini, dan cara menghapusnya.",
    "settings.loading": "Memuat pengaturan",
    "settings.browserData": "Data di browser",
    "settings.choices": "Pilihanmu",
    "settings.noChoices": "Belum ada pilihan tersimpan.",
    "settings.deleteChoices": "Hapus pilihan domisili dan posisi",
    "settings.tracked": "Lamaran yang dilacak",
    "settings.trackedCount": "{n} lamaran dilacak.",
    "settings.deleteAllTracked": "Hapus semua lamaran yang dilacak",
    "settings.deleteAll": "Hapus semua",
    "settings.recentSearch": "Pencarian terakhir",
    "settings.noRecent": "Belum ada pencarian tersimpan.",
    "settings.deleteRecent": "Hapus pencarian terakhir",
    "settings.visitorNo": "Nomor pengunjung",
    "settings.visitorHint":
      "Nomor acak yang dibuat browser ini untuk menghitung pengunjung tanpa nama. Nomor ini ikut terkirim bersama catatan kunjungan, tanpa nama dan tanpa alamat email. Menghapusnya membuat nomor baru saat kamu berkunjung lagi.",
    "settings.noVisitor": "Belum ada nomor pengunjung.",
    "settings.deleteVisitor": "Hapus nomor pengunjung",
    "settings.visitRecords": "Catatan kunjungan",
    "settings.optOut": "Jangan catat kunjungan saya",
    "settings.optOutHint":
      "Bila dicentang, kunjunganmu tidak dicatat sama sekali: halaman yang dibuka, kata yang dicari, dan klik lamar tidak terkirim. Pilihan ini hanya berlaku di browser ini. Catatan yang sudah terkirim sebelumnya tidak ikut terhapus, dan terhapus sendiri setelah 90 hari. Yang dicatat dan yang tidak dicatat ada di halaman ",
    "settings.optOutHintAfter": ".",
    "settings.account": "Akun",
    "settings.signedInAs": "Masuk sebagai",
    "settings.emailVerified": "Email sudah terverifikasi.",
    "settings.emailNotVerified":
      "Email belum terverifikasi. Ketuk tautan di email verifikasi supaya akun ini dikenali sebagai milikmu.",
    "settings.verifyEmail": "Verifikasi email",
    "settings.verifyHint":
      "Email verifikasi dikirim saat daftar. Bila tidak sampai, kirim ulang dari sini.",
    "settings.sending": "Mengirim…",
    "settings.resendEmail": "Kirim ulang email",
    "settings.checkAgain": "Periksa lagi",
    "settings.verifyStillNot":
      "Email masih belum terverifikasi. Ketuk tautan di email yang dikirim, lalu periksa lagi.",
    "settings.verifyCheckFailed":
      "Status verifikasi belum bisa diperiksa. Coba lagi sebentar lagi.",
    "settings.closeAccount": "Tutup akun",
    "settings.askOnGithub": "Minta di GitHub",
    "settings.closeHint":
      "Menutup akun belum bisa dari situs. Minta lewat Issues di repo GitHub, pengelola akan menghapus akun dan datanya.",
    "settings.notSignedIn":
      "Kamu belum masuk. Masuk itu pilihan, semua fitur tetap bisa dipakai tanpa masuk. Buka menu untuk masuk atau daftar.",
    "settings.downloadData": "Unduh data",
    "settings.downloadMine": "Unduh dataku",
    "settings.downloadHint":
      "Salinan datamu dalam satu berkas JSON: profil akun, tanda lamaran, dan pengaturan di browser ini. Berkas dibuat di perangkatmu, tidak dikirim ke mana pun.",
    "settings.downloadJson": "Unduh data (JSON)",
    "settings.wipeAll": "Hapus semua data",
    "settings.wipeHint":
      "Menghapus semua data di atas dari browser ini. Bila kamu masuk, tanda lamaran di akun ikut dihapus. Akunnya sendiri tetap ada. Menghapus tidak bisa dibatalkan.",
    "settings.confirmWipeAll": "Ya, hapus semuanya",
    "settings.wipeAllBtn": "Hapus semua dataku",
    "settings.toastTrackedDeleted": "Semua lamaran dihapus.",
    "settings.toastVisitorDeleted": "Nomor pengunjung dihapus.",
    "settings.toastChoicesDeleted": "Pilihan dihapus.",
    "settings.toastRecentDeleted": "Pencarian terakhir dihapus.",
    "settings.toastOptOutOn": "Kunjunganmu tidak dicatat lagi.",
    "settings.toastOptOutOff": "Kunjunganmu dicatat lagi.",
    "settings.toastDownloaded": "Data sudah diunduh.",
    "settings.toastWiped": "Semua data di browser ini dihapus.",
    "settings.toastWipedAccount":
      "Semua data di browser ini dihapus, dan tanda lamaran di akun ikut dihapus.",
    "auth.syncNote":
      "Lamaran di perangkat ini ikut tersimpan ke akun. Semua fitur tetap bisa dipakai tanpa masuk.",
    "auth.notVerifiedNote":
      "Email ini belum terverifikasi. Ketuk tautan di email verifikasi supaya akun ini dikenali sebagai milikmu.",
    "auth.resendVerify": "Kirim ulang email verifikasi",
    "auth.signingOut": "Keluar…",
    "auth.signOut": "Keluar",
    "auth.signInChoice":
      "Masuk itu pilihan. Tanpa masuk pun semua fitur tetap bisa dipakai, hanya lamaran yang tidak tersimpan ke akun.",
    "auth.modeLabel": "Pilih masuk atau daftar",
    "auth.signIn": "Masuk",
    "auth.signUp": "Daftar",
    "auth.displayName": "Nama tampilan (boleh kosong)",
    "auth.displayNameLabel": "Nama tampilan",
    "auth.displayNamePh": "Nama yang tampil di akun",
    "auth.email": "Email",
    "auth.password": "Kata sandi",
    "auth.passwordPh": "Minimal 6 huruf",
    "auth.passwordPhSignUp": "Minimal 8 huruf",
    "auth.loadingStatus": "Memuat status akun…",
    "auth.wait": "Tunggu…",
    "auth.createAccount": "Buat akun",
    "auth.forgotPassword": "Lupa kata sandi?",
    "auth.writeEmailFirst":
      "Tulis email dulu di kolom di atas, baru minta tautan.",
    "auth.errInvalidEmail":
      "Alamat email tidak dikenal. Periksa lagi tulisannya.",
    "auth.errWrongCredentials": "Email atau kata sandi salah.",
    "auth.errCannotRegister":
      "Tidak bisa mendaftar sekarang. Coba lagi sebentar lagi.",
    "auth.errWeakPassword": "Kata sandi terlalu pendek, minimal 6 huruf.",
    "auth.errTooManyRequests":
      "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.",
    "auth.errNoConnection":
      "Tidak ada koneksi. Periksa internet lalu coba lagi.",
    "auth.errCannotSignIn":
      "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.",
    "auth.resetSent":
      "Tautan untuk membuat kata sandi baru sudah dikirim ke email itu. Periksa kotak masuk, lalu ikuti tautannya.",
    "auth.errCannotSendReset":
      "Tidak bisa mengirim tautan sekarang. Coba lagi sebentar lagi.",
    "auth.noAccount": "Tidak ada akun yang masuk.",
    "auth.verifySent":
      "Email verifikasi sudah dikirim. Buka email itu, ketuk tautannya, lalu tekan Periksa lagi.",
    "dashMine.title": "Dasbor saya",
    "dashMine.choiceBoth": "Lowongan {posisi} di {domisili}",
    "dashMine.choiceDomisili": "Lowongan di {domisili}",
    "dashMine.choicePosisi": "Lowongan {posisi}",
    "dashMine.noChoice": "Belum ada pilihan tersimpan.",
    "dashMine.viewMatches": "Lihat yang cocok",
    "dashMine.lastSearch": "Terakhir kamu cari:",
    "dashMine.nextSteps": "Langkah berikutnya",
    "dashMine.stepChoice": "Tentukan domisili dan posisi",
    "dashMine.stepFirstMark": "Tandai lamaran pertama",
    "dashMine.stepReadMethod": "Baca cara data dicek sebelum melamar",
    "dashMine.done": "Selesai: ",
    "map.chooseCity": "Pilih kota",
    "map.label": "Peta perusahaan yang ada lowongan",
    "map.marker": "{city}, {n} perusahaan ada lowongan",
    "map.failed":
      "Peta tidak bisa dimuat. Pilih kota di atas untuk melihat daftarnya.",
    "map.loading": "Memuat peta…",
    "map.empty": "Belum ada lowongan target di peta.",
    "map.otherLocations": "Lokasi lain (tidak cocok dengan kota di peta)",
    "install.title": "Pasang aplikasi",
    "install.hint":
      "Buka Karir langsung dari layar utama, tanpa membuka browser dulu. Ukurannya kecil dan tidak mengubah apa pun di data yang tersimpan.",
    "install.installing": "Memasang…",
    "install.later": "Nanti saja",
    "info.idOnly": "Halaman ini hanya tersedia dalam Bahasa Indonesia.",
    /* --- akhir W2a --- */
  },
  en: {
    "nav.home": "Home",
    "nav.search": "Search",
    "nav.dashboard": "Dashboard",
    "nav.lamaran": "Applications",
    "nav.mulai": "Start",
    "nav.about": "About",
    "nav.method": "Method",
    "nav.faq": "FAQ",
    "nav.changelog": "Changelog",
    "header.count": "{n} companies",
    "footer.note":
      "Data is checked regularly, directly in the browser; each company records its latest check date. Openings can change after the check date, always verify on the official portal.",
    "footer.privacy":
      "Signing in is a choice, not a requirement. Without signing in, every feature still works. If you sign in, only your email, your searches, and your application marks are saved to your account, and only you and the admin can see them. Without signing in, no name or identity is saved; searches are only recorded anonymously for visit statistics.",
    "footer.repo": "GitHub repo",
    "footer.method": "Checking method",
    "footer.about": "About Karir",
    "footer.faq": "FAQ",
    "footer.support": "Support",
    "footer.changelog": "Changelog",
    "footer.map": "Map",
    "footer.settings": "Settings",
    /* --- W-P0-08 (privacy policy + terms of use): new keys only in
     * this block, existing key values untouched. --- */
    "footer.privacyPolicy": "Privacy Policy",
    "footer.terms": "Terms of Use",
    /* --- end W-P0-08 --- */
    /* --- W1-B1 (homepage photo strip, LAND-08): alt text for the
     * three photos. New keys only in this block, existing key values
     * untouched. --- */
    "landing.photoAltWarehouse":
      "Worker lifting a cardboard box inside a warehouse",
    "landing.photoAltProduction":
      "Worker checking a machine on a production line",
    "landing.photoAltCleaning": "Cleaning staff mopping the floor",
    /* --- end W1-B1 --- */
    /* --- T18 --- */
    /* Company detail (DET-05): portal cannot be opened. New keys only
     * in this block, existing key values untouched. */
    "detail.portalDown":
      "This portal could not be opened when last checked. You can still try the link below.",
    "detail.tryPortalAnyway": "Try opening the portal anyway",
    /* --- akhir T18 --- */
    /* --- T2 (search: city filter, result groups, share results):
     * new keys only in this block, existing key values untouched. --- */
    "search.city": "City",
    "search.allCities": "All cities",
    "search.groupCompanies": "Companies ({n})",
    "search.groupRoles": "Openings ({n})",
    "search.share": "Share these results",
    "search.shareCopied": "Link copied.",
    "search.shareFailed": "The link could not be copied automatically. Copy the address from the browser bar.",
    /* --- end T2 --- */
    /* --- T1f (copy channel button on the detail page): new keys only
     * in this block, existing key values untouched. --- */
    "detail.copyChannel": "Copy",
    "detail.channelCopied": "Copied.",
    "detail.channelCopyFailed":
      "Could not be copied automatically. Copy it manually from the screen.",
    "detail.copyWa": "Copy WhatsApp number",
    "detail.copyEmail": "Copy email address",
    /* --- end T1f --- */
    /* --- T13 (accessibility: new-tab links, toast, no-JS message,
     * target result count): new keys only in this block, existing
     * key values untouched. --- */
    "common.newTab": "(opens in a new tab)",
    "common.toastClose": "Dismiss notification",
    "common.noJs":
      "JavaScript is off in this browser. Search from the home page still works, but Applications, Start, and Settings need JavaScript.",
    "home.targetsShown": "Showing {n} companies",
    "search.noJsFilters":
      "Status and sort filters and other buttons need JavaScript.",
    /* --- end T13 --- */
    "landing.trustDead": "portals unreachable",
    "landing.problem1":
      "Company career channels are scattered everywhere, and it is hard to tell which portal is official and which is not.",
    "landing.problem2":
      "Openings copied from one site to another are often stale or fake.",
    "landing.freshLabel": "Last rechecked {date}",
    "landing.freshOk": "Fresh",
    "landing.freshStale": "Stale, needs rechecking",
    "landing.changesTitle": "What changed",
    "landing.photoWarehouse": "Warehouse Helper",
    "landing.photoProduction": "Production Operator",
    "landing.photoCleaning": "Cleaning Service",
    "landing.featureMapDesc":
      "See {n} companies with openings on a map, grouped by city.",
    "landing.faqTitle": "Frequently asked questions",
    "landing.faq1q": "How do I use Karir?",
    "landing.faq1a":
      "Type your location and role on the home page, then see the best matching channels. Open the official portal from the results, read the full requirements, and apply through the official channel.",
    "landing.faq2q": "Is Karir free?",
    "landing.faq2a":
      "Yes, free. No fees. Signing in is a choice, not a requirement. Without signing in, every feature still works.",
    "landing.faq3q": "How is the data checked?",
    "landing.faq3a":
      "Each company's official career channel is opened directly in the browser, and its latest check date is recorded, so you know how fresh the data is.",
    "landing.faqMore": "See all questions",
    "home.title": "Openings that were checked, not copied.",
    "home.intro": "{n} official career channels, checked directly in the browser.",
    "home.domisili": "Location",
    "home.domisiliPh": "e.g. Bogor, Depok, Cibinong",
    "home.posisi": "Role",
    "home.posisiPerusahaan": "Role/company",
    "home.posisiPh": "e.g. Warehouse Helper",
    "home.searchBtn": "Search jobs",
    "home.targets": "Verified openings",
    "home.targetsHeading": "{n} companies have the opening you are looking for",
    "home.freshNote":
      "{count} companies checked in the last 7 days, most recently on {date}. Openings can change after the check date.",
    "search.title": "Search career channels",
    "search.category": "Category",
    "search.allCategories": "All categories",
    "search.status": "Status",
    "search.allStatuses": "All statuses",
    "search.order": "Sort by",
    "search.orderRelevance": "Most relevant",
    "search.orderName": "Name A-Z",
    "search.submit": "Search",
    "search.reset": "Reset",
    "search.sortNote":
      "Results are ranked by role match, location match, and verification status.",
    "search.domisiliPh": "E.g. Depok",
    "search.posisiPh": "E.g. Administration or PGN",
    "search.showing": "Showing {a} of {b} companies",
    "search.noPositionMatch":
      "No role match in our data. The results below are channel recommendations based on location and status, not verified openings.",
    "search.loadMore": "Show more",
    "search.resultsLabel": "Search results",
    "search.metaTitle": "Search",
    "dash.title": "Data dashboard",
    "dash.byStatus": "Status breakdown",
    "dash.recheck": "Needs re-checking",
    "dash.numbersNote":
      "Every number is computed directly from the data of {n} companies. No sample numbers.",
    "dash.topCategories": "Top {n} categories",
    "dash.targetCompanies": "Companies with openings",
    "dash.andMore": "and {n} more in the company data.",
    "dash.metaTitle": "Dashboard",
    "detail.portalBtn": "Open career portal",
    "detail.share": "Share",
    "detail.copied": "Link copied.",
    "detail.related": "Similar companies",
    "detail.report": "Send report",
    "detail.reportSent":
      "Report sent. Thank you. Your report will be reviewed and fixed if correct — there is no direct reply.",
    "detail.checked": "Last checked",
    "detail.location": "Location",
    "detail.positions": "Recorded roles",
    "detail.notes": "Check notes",
    "detail.category": "Category",
    "common.back": "Back",
    "common.loading": "Loading…",
    "common.seedNote": "Showing backup data. The latest data will return once the data service recovers.",
    "common.notListed": "Not listed",
    "nav.map": "Map",
    "nav.menu": "Menu",
    "nav.settings": "Settings",
    "nav.theme": "Switch light or dark theme",
    "hero.rolesLabel": "Popular roles",
    "dash.statusQuestion": "Out of {n} channels, what did the checks find?",
    "hero.vizQuestion": "Out of {n} channels, how many fit you?",
    "hero.vizIdle": "{a} of {b} channels have openings.",
    "hero.vizMatch": "{a} of {b} channels match your search.",
    "hero.vizVerified": "{n} of them are verified openings.",
    "hero.vizLoading": "Loading {n} channels…",
    "hero.vizError": "Channels could not be loaded yet. The Search button still works.",
    "hero.legendTarget": "Openings",
    "hero.legendMatch": "Match",
    "hero.legendOther": "Other channels",
    "hero.top": "Top results",
    "hero.seeAll": "See all {n} results",
    "hero.recent": "Your last search",
    "home.targetsLead": "Verified openings",
    "home.proofTitle": "Checked directly, not copied from other sites.",
    "home.proof1": "official career channels opened and checked directly in the browser",
    "home.proof2": "with openings among them",
    "home.proof3": "Every row records its check date, so you know how fresh the data is.",
    "home.changesEmpty": "No changes recorded yet. Rechecking runs every day at 01:00 WIB.",
    "home.changesError": "The list of changes could not be loaded.",
    "home.changesDegraded":
      "The list of changes is temporarily unavailable. Please try again later.",
    "home.changesLoading": "Loading changes…",
    "home.shareTargets": "Share the openings list",
    "home.printTargets": "Print the openings list",
    "search.matchCount": "{m} match your search.",
    "search.filters": "Filters",
    "search.apply": "Show results",
    "search.empty": "No companies match.",
    "search.emptyHint": "Try changing or resetting the filters to see all companies.",
    "search.loading": "Loading channels…",
    "search.error": "Company data could not be loaded.",
    "search.retry": "Try again",
    "search.verifyNote": "This role is not verified in our data, check the portal directly.",
    "search.open": "Open portal",
    "search.mark": "Save",
    "search.unmark": "Remove mark",
    "detail.explain": "What the status means",
    "detail.reportHint": "Something wrong? Report a problem",
    "detail.noLink": "No career link was found for this company.",
    "detail.daysAgo": "{n} days ago",
    "detail.today": "today",
    "detail.deadline": "Application deadline",
    "detail.daysLeft": "{n} days left",
    "detail.deadlinePassed": "Passed",
    "detail.noPositions": "No roles visible",
    "detail.noNotes": "No notes.",
    "detail.noRelated": "No similar companies in this category yet.",
    "detail.applyChannels": "Other ways to apply",
    "detail.emailHrd": "HR email",
    "detail.waHrd": "HR WhatsApp",
    "detail.otherChannels": "Other channels",
    /* --- W1-TRACKER (DASH-08): hanya kunci baru di blok ini, nilai
     * kunci lama tidak diubah. --- */
    "dash.viewOnMap": "View on map",
    /* --- akhir W1-TRACKER --- */
    /* --- W2b (SEO + sharing + seed marker, Fase 5): new keys only in
     * this block, existing key values untouched. --- */
    "footer.feed": "RSS feed",
    "home.shareKarirTitle": "Help a friend find a real opening",
    "home.shareKarirText":
      "Share Karir with a friend who is looking for work. Free, no sign-up.",
    "home.shareKarir": "Share Karir",
    "home.shareKarirMsg":
      "Karir — openings that were checked, not copied. Search official career channels at {url}",
    "home.shareTargetsMsg": "Openings on Karir ({n} companies with openings): {url}",
    "search.emptyHelp": "Read how data is checked on the Method page",
    "search.metaDescription":
      "Search official career channels of Indonesian companies by location, role, category, city, and status. Results are ranked by best match.",
    "dash.metaDescription":
      "Karir data in numbers: channel status breakdown, top categories, and companies with openings — all computed directly from the data.",
    "detail.shortenerNote":
      "This link uses a URL shortener, so its final destination is not visible from the link. Check that the destination page really belongs to this company before entering any data.",
    /* --- akhir W2b --- */
    /* --- W2a (copy & i18n, Fase 5 Wave 2): new keys only in this
     * block. Old key values changed for UX-10, UX-12, DUKUNG-06,
     * and DUKUNG-07 are listed in the w2-a.md report. --- */
    "common.all": "All",
    "common.new": "New",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.deleteConfirm": "Yes, delete",
    "error.title": "Something went wrong.",
    "error.message":
      "This page could not be loaded. Check your connection, then try again.",
    "notfound.title": "Page not found",
    "notfound.lede":
      "The address you opened is not on Karir. The link may be mistyped, or the page may no longer exist.",
    "detail.noCheckDate": "No check date yet.",
    "detail.reportFailed":
      "Report failed to send. Check your connection, then try again.",
    "detail.reportTooSoon":
      "A report was just sent. Wait {n} seconds before sending another.",
    "detail.reportSessionLimit":
      "The report limit for this session is reached (5 reports). Try again later.",
    "detail.reportTypeLabel": "Type of problem",
    "detail.reportReasonLabel": "Describe the problem",
    "detail.reportTypeDead": "Dead link",
    "detail.reportTypeWrong": "Wrong data",
    "detail.reportTypeOther": "Other",
    "detail.reportPhDead": "E.g.: the page cannot be opened",
    "detail.reportPhWrong": "E.g.: the company name is misspelled",
    "detail.reportPhOther": "E.g.: this listing looks suspicious",
    "search.matchPosition": "Role matches",
    "search.matchLocation": "Location matches",
    "tracker.marked": "{name} saved.",
    "tracker.view": "View",
    "tracker.saveRefused":
      "The browser refused to save. Try leaving private mode.",
    "tracker.unmarked": "Mark removed.",
    "tracker.inProgress":
      "This application already has progress. Change it on the Applications page.",
    "tracker.saved": "Saved in this browser.",
    "tracker.saveFailed": "The browser refused to save.",
    "tracker.deleted": "Removed from applications.",
    "tracker.title": "My applications",
    "tracker.loading": "Loading application tracker",
    "tracker.statusLabel": "Application status",
    "tracker.dateLabel": "Date",
    "tracker.noteLabel": "Note",
    "tracker.notePlaceholder": "A note to yourself",
    "tracker.remove": "Remove from applications",
    "tracker.deleteTitle": "Remove this application?",
    "tracker.deleteMessage":
      "The application to {name} will be removed from the list.",
    "tracker.hint": "Tap a status to start tracking this company.",
    "sync.saved": "Saved in this browser and in your account.",
    "sync.sending": "Sending to your account…",
    "sync.pending": "There are changes not yet sent to your account.",
    "sync.offline":
      "No internet. Changes are saved on this device and will be sent when you reconnect.",
    "sync.busy":
      "The server is busy. Changes are saved on this device and will be sent later.",
    "sync.session":
      "Your account session ended. Sign in again so applications are saved to your account.",
    "sync.denied":
      "The account is not allowed to save. Changes are saved on this device.",
    "sync.failed":
      "Sync to your account failed. Changes are saved on this device.",
    "sync.guest":
      "Saved in this browser only. Sign in from the menu to save to your account too.",
    "lamaran.title": "My Applications",
    "lamaran.lede": "Companies you marked and applied to.",
    "lamaran.ledeAccount": "Saved on this device and in your account.",
    "lamaran.loading": "Loading applications…",
    "lamaran.retrySync": "Sync again",
    "lamaran.lastSynced": "Last synced {time}.",
    "lamaran.guestBanner":
      "This device has {n} applications not yet in your account.",
    "lamaran.mergeGuest": "Merge into your account",
    "lamaran.or": "or",
    "lamaran.leaveAlone": "leave them",
    "lamaran.filterLabel": "Filter applications",
    "lamaran.emptyTitle": "No applications tracked yet.",
    "lamaran.emptyHint":
      "Tap the mark icon on a company card, or search for a company to apply to first.",
    "lamaran.searchCompanies": "Search companies",
    "lamaran.noStatus": "No applications with the status “{status}”.",
    "lamaran.viewAll": "View all",
    "lamaran.companyNo": "Company No. {n}",
    "lamaran.openPortal": "Open {name} career portal (opens in a new tab)",
    "lamaran.notInData": "This company is no longer in the data.",
    "lamaran.statusLabel": "Status",
    "lamaran.namesFailed": "Company names could not be loaded yet.",
    "lamaran.statusChanged": "Status of {name} changed to {status}.",
    "lamaran.statusChangedUnknown":
      "Application status changed to {status}.",
    "lamaran.syncOk": "Applications are synced with your account.",
    "lamaran.syncFail": "Could not sync yet. Try again later.",
    "lamaran.mergeOk": "Applications merged into your account.",
    "lamaran.mergeFail": "Merge failed. Try again later.",
    "mulai.lede":
      "Karir collects official company job channels. Answer two things below, then see the channels that fit you best.",
    "mulai.loadingChoices": "Loading your choices",
    "mulai.currentChoices": "Your current choices",
    "mulai.notFilled": "Not filled in",
    "mulai.viewMatches": "See matching openings",
    "mulai.editChoices": "Change choices",
    "mulai.clearChoices": "Delete my choices",
    "mulai.savedLocal":
      "Your choices are saved in this browser only, not sent anywhere.",
    "mulai.clearTitle": "Delete your choices?",
    "mulai.clearMessage":
      "Your saved location and role will be deleted from this browser.",
    "mulai.wizardLabel": "Three short steps",
    "mulai.stepOf": "Step {n} of 3",
    "mulai.whereLive": "Where do you live?",
    "mulai.whatRole": "What role are you looking for?",
    "mulai.posisiPh": "e.g. Warehouse Helper, Cleaning Service",
    "mulai.matchedChannels": "matching channels",
    "mulai.verifiedAmong": "{n} of them are verified openings.",
    "mulai.topThree": "Top three matches",
    "mulai.countError":
      "The number of channels could not be counted yet, but the button below still works.",
    "mulai.fillOne":
      "Fill in one of them to see how many channels match.",
    "mulai.skip": "Skip",
    "mulai.next": "Next",
    "mulai.saveFailed": "Your choices could not be saved in this browser.",
    "mulai.clearFailed": "Your choices could not be deleted. Try again.",
    "settings.lede": "What is saved in this browser, and how to delete it.",
    "settings.loading": "Loading settings",
    "settings.browserData": "Data in the browser",
    "settings.choices": "Your choices",
    "settings.noChoices": "No choices saved yet.",
    "settings.deleteChoices": "Delete your location and role choices",
    "settings.tracked": "Tracked applications",
    "settings.trackedCount": "{n} applications tracked.",
    "settings.deleteAllTracked": "Delete all tracked applications",
    "settings.deleteAll": "Delete all",
    "settings.recentSearch": "Last search",
    "settings.noRecent": "No search saved yet.",
    "settings.deleteRecent": "Delete last search",
    "settings.visitorNo": "Visitor number",
    "settings.visitorHint":
      "A random number this browser created to count visitors without names. It is sent along with visit records, without a name or email address. Deleting it creates a new number on your next visit.",
    "settings.noVisitor": "No visitor number yet.",
    "settings.deleteVisitor": "Delete visitor number",
    "settings.visitRecords": "Visit records",
    "settings.optOut": "Don't record my visits",
    "settings.optOutHint":
      "If checked, your visits are not recorded at all: pages you open, words you search, and apply clicks are not sent. This choice only applies in this browser. Records already sent are not deleted, and delete themselves after 90 days. What is recorded and what is not is on the ",
    "settings.optOutHintAfter": " page.",
    "settings.account": "Account",
    "settings.signedInAs": "Signed in as",
    "settings.emailVerified": "Email verified.",
    "settings.emailNotVerified":
      "Email not verified yet. Tap the link in the verification email so this account is recognized as yours.",
    "settings.verifyEmail": "Verify email",
    "settings.verifyHint":
      "A verification email was sent when you signed up. If it did not arrive, resend it from here.",
    "settings.sending": "Sending…",
    "settings.resendEmail": "Resend email",
    "settings.checkAgain": "Check again",
    "settings.verifyStillNot":
      "Email is still not verified. Tap the link in the email that was sent, then check again.",
    "settings.verifyCheckFailed":
      "Verification status could not be checked. Try again in a bit.",
    "settings.closeAccount": "Close account",
    "settings.askOnGithub": "Ask on GitHub",
    "settings.closeHint":
      "Closing an account is not possible from the site yet. Ask through Issues in the GitHub repo, and the maintainer will delete the account and its data.",
    "settings.notSignedIn":
      "You are not signed in. Signing in is a choice, every feature still works without it. Open the menu to sign in or sign up.",
    "settings.downloadData": "Download data",
    "settings.downloadMine": "Download my data",
    "settings.downloadHint":
      "A copy of your data in one JSON file: account profile, application marks, and settings in this browser. The file is created on your device, not sent anywhere.",
    "settings.downloadJson": "Download data (JSON)",
    "settings.wipeAll": "Delete all data",
    "settings.wipeHint":
      "Deletes all the data above from this browser. If you are signed in, application marks in your account are deleted too. The account itself stays. Deleting cannot be undone.",
    "settings.confirmWipeAll": "Yes, delete everything",
    "settings.wipeAllBtn": "Delete all my data",
    "settings.toastTrackedDeleted": "All applications deleted.",
    "settings.toastVisitorDeleted": "Visitor number deleted.",
    "settings.toastChoicesDeleted": "Choices deleted.",
    "settings.toastRecentDeleted": "Last search deleted.",
    "settings.toastOptOutOn": "Your visits are no longer recorded.",
    "settings.toastOptOutOff": "Your visits are recorded again.",
    "settings.toastDownloaded": "Data downloaded.",
    "settings.toastWiped": "All data in this browser deleted.",
    "settings.toastWipedAccount":
      "All data in this browser deleted, and application marks in your account deleted too.",
    "auth.syncNote":
      "Applications on this device are also saved to your account. Every feature still works without signing in.",
    "auth.notVerifiedNote":
      "This email is not verified yet. Tap the link in the verification email so this account is recognized as yours.",
    "auth.resendVerify": "Resend verification email",
    "auth.signingOut": "Signing out…",
    "auth.signOut": "Sign out",
    "auth.signInChoice":
      "Signing in is a choice. Without signing in, every feature still works, only applications are not saved to your account.",
    "auth.modeLabel": "Choose sign in or sign up",
    "auth.signIn": "Sign in",
    "auth.signUp": "Sign up",
    "auth.displayName": "Display name (may be empty)",
    "auth.displayNameLabel": "Display name",
    "auth.displayNamePh": "The name shown on your account",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.passwordPh": "At least 6 characters",
    "auth.passwordPhSignUp": "At least 8 characters",
    "auth.loadingStatus": "Loading account status…",
    "auth.wait": "Please wait…",
    "auth.createAccount": "Create account",
    "auth.forgotPassword": "Forgot password?",
    "auth.writeEmailFirst":
      "Write your email in the field above first, then ask for a link.",
    "auth.errInvalidEmail":
      "This email address doesn't look right. Check it again.",
    "auth.errWrongCredentials": "Wrong email or password.",
    "auth.errCannotRegister": "Can't sign up right now. Try again in a bit.",
    "auth.errWeakPassword": "Password is too short, at least 6 characters.",
    "auth.errTooManyRequests": "Too many tries. Wait a bit, then try again.",
    "auth.errNoConnection":
      "No connection. Check your internet, then try again.",
    "auth.errCannotSignIn": "Can't sign in right now. Try again in a bit.",
    "auth.resetSent":
      "A link to create a new password was sent to that email. Check your inbox, then follow the link.",
    "auth.errCannotSendReset":
      "Can't send the link right now. Try again in a bit.",
    "auth.noAccount": "No account is signed in.",
    "auth.verifySent":
      "Verification email sent. Open it, tap the link, then press Check again.",
    "dashMine.title": "My dashboard",
    "dashMine.choiceBoth": "{posisi} openings in {domisili}",
    "dashMine.choiceDomisili": "Openings in {domisili}",
    "dashMine.choicePosisi": "{posisi} openings",
    "dashMine.noChoice": "No choices saved yet.",
    "dashMine.viewMatches": "See matches",
    "dashMine.lastSearch": "Your last search:",
    "dashMine.nextSteps": "Next steps",
    "dashMine.stepChoice": "Set your location and role",
    "dashMine.stepFirstMark": "Mark your first application",
    "dashMine.stepReadMethod": "Read how data is checked before applying",
    "dashMine.done": "Done: ",
    "map.chooseCity": "Choose a city",
    "map.label": "Map of companies with openings",
    "map.marker": "{city}, {n} companies with openings",
    "map.failed":
      "The map could not be loaded. Choose a city above to see its list.",
    "map.loading": "Loading the map…",
    "map.empty": "No target openings on the map yet.",
    "map.otherLocations": "Other locations (not matching a city on the map)",
    "install.title": "Install the app",
    "install.hint":
      "Open Karir straight from your home screen, without opening the browser first. It is small and changes nothing in your saved data.",
    "install.installing": "Installing…",
    "install.later": "Later",
    "info.idOnly": "This page is only available in Indonesian.",
    /* --- end W2a --- */
  },
};

export async function getLocale() {
  try {
    const store = await cookies();
    const v = store.get("karir-locale")?.value;
    return v === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

export function t(locale, key, vars) {
  const lang = DICT[locale] || DICT.id;
  let s = lang[key] ?? DICT.id[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
