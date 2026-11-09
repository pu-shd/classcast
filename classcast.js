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
