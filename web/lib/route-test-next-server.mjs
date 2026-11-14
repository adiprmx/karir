/* Stub minimal `next/server` untuk test wiring rute API
 * (lib/api-routes.test.js, QA-04). Meniru permukaan NextResponse
 * yang dipakai route Karir: json(), redirect(), status, headers,
 * json()/text(), dan cookies.set(). BUKAN pengganti NextResponse
 * asli — hanya cukup untuk memanggil handler rute di node:test
 * tanpa server Next. Dipakai HANYA lewat loader test
 * (lib/route-test-loader.mjs); tidak dipakai kode produksi maupun
 * build Next. */

export class NextResponse {
  constructor(body = null, init = {}) {
    this._body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers || {});
    this.cookies = {
      set: (name, value, options = {}) => {
        let cookie = `${name}=${encodeURIComponent(value)}`;
        if (options.path) cookie += `; Path=${options.path}`;
        if (options.maxAge != null) cookie += `; Max-Age=${options.maxAge}`;
        if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
        if (options.secure) cookie += "; Secure";
        if (options.httpOnly) cookie += "; HttpOnly";
        this.headers.append("set-cookie", cookie);
      },
    };
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  static json(body, init = {}) {
    const res = new NextResponse(JSON.stringify(body), init);
    if (!res.headers.has("content-type")) {
      res.headers.set("content-type", "application/json");
    }
    return res;
  }

  static redirect(url, init = {}) {
    const res = new NextResponse(null, {
      status: init.status ?? 307,
      headers: init.headers || {},
    });
    res.headers.set("location", String(url));
    return res;
  }

  async json() {
    return JSON.parse(this._body ?? "null");
  }

  async text() {
    return this._body ?? "";
  }
}
