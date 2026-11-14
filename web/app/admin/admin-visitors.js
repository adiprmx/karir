"use client";

/* Seksi Pengunjung panel admin (FE-18, dipindah dari page.js):
 * ringkasan kunjungan 30 hari terakhir — pengunjung per hari,
 * halaman dan kata yang paling sering dibuka dan dicari, klik
 * lamar, akun paling aktif, dan sinyal kemungkinan bot. Dimuat
 * hanya bila dibuka, supaya hemat kuota baca. */

export default function VisitorsSection({
  visitorsOpen,
  visitorsError,
  loadingVisitors,
  visitorEvents,
  visitorSummary,
  accountActivity,
  botSignals,
  profilesError,
  visitorsCapped,
  onOpen,
}) {
  return (
    <div className="filters" style={{ marginTop: 24 }}>
      <p className="section-label">Pengunjung</p>
      <p className="section-note">
        Ringkasan kunjungan 30 hari terakhir. Angka dihitung dari catatan
        yang masuk, tanpa menyimpan alamat pengunjung. Dimuat hanya bila
        dibuka, supaya hemat kuota baca.
      </p>
      {!visitorsOpen ? (
        <button
          type="button"
          className="btn ghost"
          onClick={onOpen}
        >
          Tampilkan data pengunjung
        </button>
      ) : (
        <>
      {visitorsError && <p className="notice">{visitorsError}</p>}
      {loadingVisitors && (
        <div className="state">
          <strong>Memuat data pengunjung…</strong>
        </div>
      )}
      {!loadingVisitors &&
        !visitorsError &&
        visitorEvents.length === 0 && (
          <p className="notice">
            Belum ada data pengunjung. Pencatatan mulai berjalan setelah
            aturan pengunjung diterbitkan.
          </p>
        )}
      {!loadingVisitors &&
        !visitorsError &&
        visitorEvents.length > 0 && (
          <>
            <div className="stat-row">
              <span className="stat-num num">
                {visitorSummary.serious.count} dari{" "}
                {visitorSummary.serious.total}
              </span>
              <span className="stat-label">
                kunjungan ({visitorSummary.serious.percent}%) mencari,
                membuka detail, lalu menandai lamaran atau mengklik
                lamar. Kode pengunjung berubah tiap hari demi privasi,
                jadi ini kunjungan unik harian, bukan jumlah orang
                yang berbeda.
              </span>
            </div>

            <p>
              <strong>Pengunjung per hari</strong>
            </p>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>Pengunjung</th>
                </tr>
              </thead>
              <tbody>
                {visitorSummary.daily.map((d) => (
                  <tr key={d.day}>
                    <td data-label="Hari">{d.label}</td>
                    <td data-label="Pengunjung" className="num">
                      {d.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p>
              <strong>Halaman paling sering dibuka</strong>
            </p>
            {visitorSummary.topPaths.length === 0 ? (
              <p className="section-note">
                Belum ada halaman yang tercatat dibuka.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Halaman</th>
                    <th>Dibuka</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.topPaths.map((row) => (
                    <tr key={row.path}>
                      <td data-label="Halaman">{row.path}</td>
                      <td data-label="Dibuka" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Kata yang paling sering dicari</strong>
            </p>
            {visitorSummary.topSearches.length === 0 ? (
              <p className="section-note">
                Belum ada pencarian yang tercatat.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Kata yang dicari</th>
                    <th>Dicari</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.topSearches.map((row) => (
                    <tr key={row.q}>
                      <td data-label="Kata yang dicari">{row.q}</td>
                      <td data-label="Dicari" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Pencarian tanpa hasil</strong>
            </p>
            <p className="section-note">
              Kata yang dicari tapi tidak menemukan perusahaan apa pun.
              Hanya dari event pencarian yang membawa jumlah hasil;
              event lama tanpa jumlah hasil tidak ikut dihitung.
            </p>
            {visitorSummary.noResultSearches.length === 0 ? (
              <p className="section-note">
                Belum ada pencarian tanpa hasil yang tercatat.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Kata yang dicari</th>
                    <th>Dicari</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.noResultSearches.map((row) => (
                    <tr key={row.q}>
                      <td data-label="Kata yang dicari">{row.q}</td>
                      <td data-label="Dicari" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Perusahaan paling sering dibuka</strong>
            </p>
            {visitorSummary.topCompanies.length === 0 ? (
              <p className="section-note">
                Belum ada detail perusahaan yang dibuka.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Perusahaan</th>
                    <th>Dibuka</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.topCompanies.map((row) => (
                    <tr key={row.no}>
                      <td data-label="Perusahaan">
                        {row.no}. {row.name}
                      </td>
                      <td data-label="Dibuka" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Perusahaan paling sering diklik lamar</strong>
            </p>
            {visitorSummary.topPortalClicks.length === 0 ? (
              <p className="section-note">
                Belum ada klik lamar yang tercatat.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Perusahaan</th>
                    <th>Diklik</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.topPortalClicks.map((row) => (
                    <tr key={row.no}>
                      <td data-label="Perusahaan">
                        {row.no}. {row.name}
                      </td>
                      <td data-label="Diklik" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Kanal lamar yang diklik</strong>
            </p>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Kanal</th>
                  <th>Diklik</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Kanal">Portal perusahaan</td>
                  <td data-label="Diklik" className="num">
                    {visitorSummary.portalChannels.portal}
                  </td>
                </tr>
                <tr>
                  <td data-label="Kanal">WhatsApp</td>
                  <td data-label="Diklik" className="num">
                    {visitorSummary.portalChannels.wa}
                  </td>
                </tr>
                <tr>
                  <td data-label="Kanal">Email</td>
                  <td data-label="Diklik" className="num">
                    {visitorSummary.portalChannels.email}
                  </td>
                </tr>
              </tbody>
            </table>

            <p>
              <strong>Filter yang paling sering dipakai</strong>
            </p>
            {visitorSummary.topFilters.length === 0 ? (
              <p className="section-note">
                Belum ada filter yang tercatat dipakai.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Filter</th>
                    <th>Dipakai</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorSummary.topFilters.map((row) => (
                    <tr key={row.filter}>
                      <td data-label="Filter">{row.filter}</td>
                      <td data-label="Dipakai" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p>
              <strong>Penanda lamaran</strong>
            </p>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {visitorSummary.tracker.map((row) => (
                  <tr key={row.action}>
                    <td data-label="Status">{row.action}</td>
                    <td data-label="Jumlah" className="num">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p>
              <strong>Akun paling aktif</strong>
            </p>
            <p className="section-note">
              Akun yang masuk dan paling sering memakai situs. Tamu
              dihitung terpisah tanpa nama.
            </p>
            {profilesError && <p className="notice">{profilesError}</p>}
            <p className="notice">
              Yang butuh beneran: {accountActivity.seriousLogin} akun
              masuk dan {accountActivity.guests.serious} tamu dari{" "}
              {accountActivity.guests.totalVisitors} tamu, mencari,
              membuka detail, lalu menandai lamaran atau mengklik
              lamar.
            </p>
            {accountActivity.accounts.length === 0 ? (
              <p className="section-note">
                Belum ada akun yang masuk dan tercatat aktif.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th>Pencarian</th>
                    <th>Dibuka</th>
                    <th>Ditandai</th>
                  </tr>
                </thead>
                <tbody>
                  {accountActivity.accounts.map((row) => (
                    <tr key={row.uid}>
                      <td data-label="Akun">
                        {row.displayName ? `${row.displayName} · ` : ""}
                        {row.email ||
                          `Akun tanpa email tersimpan (${row.uid.slice(0, 8)})`}
                      </td>
                      <td data-label="Pencarian" className="num">
                        {row.searches}
                      </td>
                      <td data-label="Dibuka" className="num">
                        {row.opened}
                      </td>
                      <td data-label="Ditandai" className="num">
                        {row.tracker}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="section-note">
              Tamu: {accountActivity.guests.searches} pencarian,{" "}
              {accountActivity.guests.opened} detail dibuka,{" "}
              {accountActivity.guests.tracker} lamaran ditandai, dari{" "}
              {accountActivity.guests.total} aktivitas.
            </p>

            <p>
              <strong>Kemungkinan bot</strong>
            </p>
            <p className="section-note">
              Hanya untuk dilihat. Tidak ada yang diblokir otomatis
              dari sini.
            </p>
            <p className="notice">
              Aktivitas bertanda otomatis: {botSignals.flagged}.
              {!botSignals.hasFlagField &&
                " Penanda dari server belum ada di data ini, jadi angkanya 0."}
            </p>
            <p>
              <strong>Pengunjung paling aktif</strong>
            </p>
            {botSignals.top.length === 0 ? (
              <p className="section-note">
                Belum ada aktivitas pengunjung yang tercatat.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Pengunjung</th>
                    <th>Aktivitas</th>
                  </tr>
                </thead>
                <tbody>
                  {botSignals.top.map((row) => (
                    <tr key={row.key}>
                      <td data-label="Pengunjung">
                        {row.key.slice(0, 12)}
                      </td>
                      <td data-label="Aktivitas" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>
              <strong>Tanpa membuka halaman</strong>
            </p>
            <p className="section-note">
              Pengunjung dengan 3 aktivitas atau lebih dan nol halaman
              yang dibuka: {botSignals.noPageviewTotal}.
            </p>
            {botSignals.noPageview.length === 0 ? (
              <p className="section-note">
                Tidak ada pengunjung dengan 3 aktivitas atau lebih tanpa
                membuka halaman.
              </p>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Pengunjung</th>
                    <th>Aktivitas</th>
                  </tr>
                </thead>
                <tbody>
                  {botSignals.noPageview.map((row) => (
                    <tr key={row.key}>
                      <td data-label="Pengunjung">
                        {row.key.slice(0, 12)}
                      </td>
                      <td data-label="Aktivitas" className="num">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      {visitorsCapped && !visitorsError && (
        <p className="section-note">
          Angka di atas dihitung dari 300 aktivitas terakhir.
        </p>
      )}
        </>
      )}
    </div>
  );
}
