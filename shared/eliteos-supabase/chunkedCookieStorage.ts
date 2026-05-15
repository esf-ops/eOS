/**
 * Cross-subdomain Supabase auth persistence for eliteOS heads under *.eliteosfab.com.
 * Browser default storage is origin-scoped (localStorage); this adapter mirrors the session
 * in chunked Secure cookies with Domain=.eliteosfab.com so Home + heads share one login.
 *
 * Handles every storage key Supabase uses (session JSON, PKCE verifier, etc.).
 *
 * Security: stores only what Supabase already persisted (anon-key-scoped session JSON).
 * Never store service role or backend secrets here.
 */

/** Mirrors GoTrue SupportedStorage sync subset used by supabase-js */
export type EliteosAuthStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type ChunkedCookieStorageOptions = {
  /** e.g. ".eliteosfab.com" — must include leading dot for shared subdomains */
  cookieDomain: string;
  /** Use Secure cookies (required except localhost/http dev) */
  secure: boolean;
  /** SameSite attribute */
  sameSite?: "Lax" | "Strict" | "None";
};

const CHUNK_BYTES = 3200;
const COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
const MAX_CHUNKS = 48;

function cookieSafeId(storageKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < storageKey.length; i++) {
    h = Math.imul(h ^ storageKey.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(36);
}

function metaName(key: string): string {
  return `eos_sb_${cookieSafeId(key)}_n`;
}

function chunkName(key: string, i: number): string {
  return `eos_sb_${cookieSafeId(key)}_${i}`;
}

function splitUtf8(value: string): string[] {
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(value);
    const out: string[] = [];
    for (let o = 0; o < bytes.length; o += CHUNK_BYTES) {
      const slice = bytes.subarray(o, o + CHUNK_BYTES);
      let bin = "";
      for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]!);
      out.push(btoa(bin));
    }
    return out;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_BYTES) {
    out.push(btoa(unescape(encodeURIComponent(value.slice(i, i + CHUNK_BYTES)))));
  }
  return out;
}

function joinChunks(chunks: string[]): string {
  const bytes: number[] = [];
  for (const c of chunks) {
    const bin = atob(c);
    for (let i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
  }
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  return decodeURIComponent(escape(String.fromCharCode(...bytes)));
}

function readCookieRaw(name: string): string | null {
  if (typeof document === "undefined") return null;
  const needle = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split("; ");
  for (const p of parts) {
    if (p.startsWith(needle)) {
      try {
        return decodeURIComponent(p.slice(needle.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function writeCookieRaw(name: string, value: string, opts: ChunkedCookieStorageOptions & { maxAgeSec: number }): void {
  if (typeof document === "undefined") return;
  const sameSite = opts.sameSite ?? "Lax";
  let c = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}; Max-Age=${opts.maxAgeSec}`;
  if (opts.cookieDomain) c += `; Domain=${opts.cookieDomain}`;
  if (opts.secure) c += `; Secure`;
  document.cookie = c;
}

function deleteCookieRaw(name: string, opts: ChunkedCookieStorageOptions): void {
  writeCookieRaw(name, "", { ...opts, maxAgeSec: 0 });
}

function readLegacyLocal(storageKey: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
  } catch {
    return null;
  }
}

function clearLegacyLocal(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/**
 * Cookie-backed storage for all Supabase auth keys on this origin adapter (session, PKCE, etc.).
 */
export function createChunkedCookieAuthStorage(opts: ChunkedCookieStorageOptions): EliteosAuthStorage {
  function writeChunks(storageKey: string, value: string): void {
    const meta = metaName(storageKey);
    const chunks = splitUtf8(value);
    writeCookieRaw(meta, String(chunks.length), { ...opts, maxAgeSec: COOKIE_MAX_AGE_SEC });
    for (let i = 0; i < chunks.length; i++) {
      writeCookieRaw(chunkName(storageKey, i), chunks[i]!, { ...opts, maxAgeSec: COOKIE_MAX_AGE_SEC });
    }
  }

  function removeAll(storageKey: string): void {
    const meta = metaName(storageKey);
    const countRaw = readCookieRaw(meta);
    const n = countRaw ? parseInt(countRaw, 10) : 0;
    deleteCookieRaw(meta, opts);
    const maxClear = Math.max(n, MAX_CHUNKS);
    for (let i = 0; i < maxClear; i++) {
      deleteCookieRaw(chunkName(storageKey, i), opts);
    }
    clearLegacyLocal(storageKey);
  }

  return {
    getItem(key: string): string | null {
      const meta = metaName(key);
      const countRaw = readCookieRaw(meta);
      const n = countRaw ? parseInt(countRaw, 10) : 0;
      if (n > 0 && n <= MAX_CHUNKS) {
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const c = readCookieRaw(chunkName(key, i));
          if (c == null) return null;
          parts.push(c);
        }
        try {
          return joinChunks(parts);
        } catch {
          return null;
        }
      }

      const legacy = readLegacyLocal(key);
      if (legacy) {
        try {
          writeChunks(key, legacy);
        } catch {
          /* ignore migration failures */
        }
        clearLegacyLocal(key);
        return legacy;
      }

      return null;
    },

    setItem(key: string, value: string): void {
      removeAll(key);
      writeChunks(key, value);
    },

    removeItem(key: string): void {
      removeAll(key);
    }
  };
}
