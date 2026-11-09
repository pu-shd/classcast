// UmbraCast core logic: roster parsing and VDO.ninja link building.
// Pure functions only, so they can be unit-tested in Node without a browser.

export const DEFAULT_BASE_URL = "https://vdo.ninja";

/**
 * @typedef {{ name: string, id: string }} Student
 * @typedef {{ headers: string[], rows: string[][] }} ParsedCSV
 */

/**
 * Generate a URL-safe stream ID fragment from a name.
 * @param {string} name
 * @returns {string}
 */
export function nameToId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 30);
}

/**
 * Turn a list of names into students with unique IDs. Duplicate IDs get
 * a numeric suffix (alice, alice_2, ...), in roster order, so the same
 * roster always yields the same IDs.
 * @param {string[]} names
 * @returns {Student[]}
 */
export function assignIds(names) {
    /** @type {Record<string, number>} */
    const idCounts = {};
    return names.map((rawName) => {
        const name = rawName.trim();
        const baseId = nameToId(name) || "student";
        if (idCounts[baseId]) {
            idCounts[baseId]++;
            return { name, id: `${baseId}_${idCounts[baseId]}` };
        }
        idCounts[baseId] = 1;
        return { name, id: baseId };
    });
}

/**
 * Parse CSV text. Handles quoted fields and escaped quotes; skips blank lines.
 * @param {string} text
 * @returns {ParsedCSV}
 */
export function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    /** @param {string} line */
    const parseRow = (line) => {
        /** @type {string[]} */
        const result = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === "," && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const rows = lines.map(parseRow);
    return { headers: rows[0], rows };
}

/**
 * Index of the first header that looks like a name column, or -1.
 * @param {string[]} headerRow
 * @returns {number}
 */
export function detectNameColumn(headerRow) {
    return headerRow.findIndex((h) => /name/i.test(h) || /student/i.test(h));
}

/**
 * Extract non-empty names from one column of parsed CSV rows.
 * @param {string[][]} rows
 * @param {{ hasHeader: boolean, column: number }} options
 * @returns {string[]}
 */
export function namesFromRows(rows, { hasHeader, column }) {
    return rows
        .slice(hasHeader ? 1 : 0)
        .map((row) => row[column])
        .filter((name) => typeof name === "string" && name.trim() !== "")
        .map((name) => name.trim());
}

/**
 * @param {string} password
 * @returns {string}
 */
function passwordParam(password) {
    return password ? `&password=${encodeURIComponent(password)}` : "";
}

/**
 * Link a student opens to share their screen (screen only, no audio, 1080p).
 * @param {string} baseUrl
 * @param {string} streamId
 * @param {string} password
 * @returns {string}
 */
export function shareUrl(baseUrl, streamId, password) {
    const base = baseUrl.replace(/\/$/, "");
    return `${base}/?push=${encodeURIComponent(streamId)}&screenshare&quality=0&screensharecontenthint=detail&audiobitrate=0&noaudio${passwordParam(password)}`;
}

/**
 * Link the presenter opens to view one student's screen at full quality.
 * @param {string} baseUrl
 * @param {string} streamId
 * @param {string} password
 * @returns {string}
 */
export function viewUrl(baseUrl, streamId, password) {
    const base = baseUrl.replace(/\/$/, "");
    return `${base}/?view=${encodeURIComponent(streamId)}&scene&videobitrate=12000&scale=100&sharperscreen&codec=vp9${passwordParam(password)}`;
}

/**
 * Render one row per student, with Share and View links.
 * @param {HTMLElement} container
 * @param {Student[]} students
 * @param {{ share: (id: string) => string, view: (id: string) => string }} links
 */
export function renderStudentRows(container, students, links) {
    const doc = container.ownerDocument;
    /**
     * @param {string} href
     * @param {string} className
     * @param {string} label
     */
    const link = (href, className, label) => {
        const a = doc.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = `btn ${className}`;
        a.textContent = label;
        return a;
    };
    const rows = students.map((student) => {
        const row = doc.createElement("div");
        row.className = "student-row";
        const name = doc.createElement("span");
        name.className = "student-name";
        const id = doc.createElement("span");
        id.className = "student-id";
        id.textContent = `#${student.id}`;
        name.append(student.name, id);
        row.append(
            name,
            link(links.share(student.id), "btn-share", "Share"),
            link(links.view(student.id), "btn-view", "View"),
        );
        return row;
    });
    container.replaceChildren(...rows);
}

/**
 * Fill the column <select> with one option per CSV column.
 * @param {HTMLSelectElement} select
 * @param {string[]} firstRow
 * @param {boolean} hasHeader
 */
export function renderColumnOptions(select, firstRow, hasHeader) {
    const doc = select.ownerDocument;
    select.replaceChildren(...firstRow.map((col, i) => {
        const option = doc.createElement("option");
        option.value = String(i);
        option.textContent = hasHeader ? col : `Column ${i + 1}`;
        return option;
    }));
}

// ---------------------------------------------------------------------------
// Class links: the roster and settings travel in the URL fragment (#...).
// Browsers never send the fragment to the server, so names stay off GitHub.
// Everything decoded from a link is untrusted and validated here.
// ---------------------------------------------------------------------------

export const LIMITS = Object.freeze({
    maxStudents: 500,
    maxNameLength: 100,
    maxPasswordLength: 128,
    maxEncodedLength: 64 * 1024,
    maxDecodedBytes: 256 * 1024,
});

const CONFIG_VERSION = 1;
const SESSION_RE = /^[a-z0-9]{4,32}$/i;
// C0/C1 controls plus bidi overrides and isolates, which can disguise names.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_RE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * @typedef {{
 *   names?: string[],
 *   baseUrl?: string,
 *   password?: string,
 * }} ClassConfig
 */

/**
 * Strip control and bidi characters, collapse whitespace and cap length.
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
export function cleanText(value, maxLength) {
    return value.replace(/\s+/g, " ").replace(UNSAFE_CHARS_RE, "").trim().slice(0, maxLength);
}

/**
 * Validate a VDO.ninja base URL. Only https (or http on localhost) is
 * allowed, so a crafted link can't turn Share/View into javascript: URLs.
 * @param {string} input
 * @returns {string} the URL without query, fragment or trailing slash
 */
export function normalizeBaseUrl(input) {
    let url;
    try {
        url = new URL(input.trim());
    } catch {
        throw new Error("VDO.ninja base URL is not a valid URL");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
        throw new Error("VDO.ninja base URL must start with https://");
    }
    if (url.username || url.password) {
        throw new Error("VDO.ninja base URL must not contain credentials");
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidSession(value) {
    return typeof value === "string" && SESSION_RE.test(value);
}

/**
 * A new random session ID (10 base-36 characters).
 * @returns {string}
 */
export function newSessionId() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Class link is damaged (bad characters)");
    let binary;
    try {
        binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
        throw new Error("Class link is damaged (bad encoding)");
    }
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Run bytes through a (de)compression stream, refusing output over `limit`.
 * @param {Uint8Array} bytes
 * @param {CompressionStream | DecompressionStream} transform
 * @param {number} limit
 * @returns {Promise<Uint8Array>}
 */
async function pipeBytes(bytes, transform, limit) {
    const reader = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(transform).getReader();
    /** @type {Uint8Array[]} */
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) {
            await reader.cancel();
            throw new Error("Class link is too large");
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

/**
 * Validate and normalise a decoded config object.
 * @param {unknown} raw
 * @returns {ClassConfig}
 */
export function validateConfig(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Class link is damaged (not an object)");
    }
    const obj = /** @type {Record<string, unknown>} */ (raw);
    if (obj.v !== CONFIG_VERSION) {
        throw new Error("Class link was made by a different version of UmbraCast");
    }
    /** @type {ClassConfig} */
    const config = {};
    if (obj.n !== undefined) {
        if (!Array.isArray(obj.n) || obj.n.some((n) => typeof n !== "string")) {
            throw new Error("Class link roster is damaged");
        }
        if (obj.n.length > LIMITS.maxStudents) {
            throw new Error(`Class link roster has more than ${LIMITS.maxStudents} students`);
        }
        const names = obj.n.map((n) => cleanText(n, LIMITS.maxNameLength)).filter(Boolean);
        if (names.length === 0) throw new Error("Class link roster is empty");
        config.names = names;
    }
    if (obj.b !== undefined) {
        if (typeof obj.b !== "string") throw new Error("Class link base URL is damaged");
        config.baseUrl = normalizeBaseUrl(obj.b);
    }
    if (obj.p !== undefined) {
        if (typeof obj.p !== "string") throw new Error("Class link password is damaged");
        config.password = cleanText(obj.p, LIMITS.maxPasswordLength);
    }
    return config;
}

/**
 * Encode a config for the URL fragment: "z" + base64url(deflate-raw(JSON)),
 * or "j" + base64url(JSON) where CompressionStream is unavailable.
 * @param {ClassConfig} config
 * @returns {Promise<string>}
 */
export async function encodeConfig(config) {
    /** @type {Record<string, unknown>} */
    const wire = { v: CONFIG_VERSION };
    if (config.names) wire.n = config.names;
    if (config.baseUrl && config.baseUrl !== DEFAULT_BASE_URL) wire.b = config.baseUrl;
    if (config.password) wire.p = config.password;
    const json = new TextEncoder().encode(JSON.stringify(wire));
    if (typeof CompressionStream === "function") {
        const packed = await pipeBytes(json, new CompressionStream("deflate-raw"), Infinity);
        return "z" + toBase64Url(packed);
    }
    return "j" + toBase64Url(json);
}

/**
 * Decode and validate a config produced by encodeConfig.
 * @param {string} encoded
 * @returns {Promise<ClassConfig>}
 */
export async function decodeConfig(encoded) {
    if (encoded.length > LIMITS.maxEncodedLength) throw new Error("Class link is too large");
    const kind = encoded[0];
    const body = fromBase64Url(encoded.slice(1));
    let bytes;
    if (kind === "z") {
        if (typeof DecompressionStream !== "function") {
            throw new Error("This browser is too old to open class links");
        }
        try {
            bytes = await pipeBytes(body, new DecompressionStream("deflate-raw"), LIMITS.maxDecodedBytes);
        } catch (err) {
            if (err instanceof Error && err.message === "Class link is too large") throw err;
            throw new Error("Class link is damaged (cannot decompress)", { cause: err });
        }
    } else if (kind === "j") {
        if (body.length > LIMITS.maxDecodedBytes) throw new Error("Class link is too large");
        bytes = body;
    } else {
        throw new Error("Class link is damaged (unknown format)");
    }
    let parsed;
    try {
        parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
        throw new Error("Class link is damaged (bad data)");
    }
    return validateConfig(parsed);
}

/**
 * Split a location.hash into its session ID and encoded config.
 * An invalid session is reported as null so the caller can replace it.
 * @param {string} hash
 * @returns {{ session: string | null, data: string | null }}
 */
export function parseHash(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const session = params.get("session");
    return { session: isValidSession(session) ? session : null, data: params.get("d") };
}

/**
 * @param {string} session
 * @param {string | null} data
 * @returns {string} fragment without the leading "#"
 */
export function buildHash(session, data) {
    return data ? `session=${session}&d=${data}` : `session=${session}`;
}
