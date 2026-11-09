import { test } from "node:test";
import assert from "node:assert/strict";
import {
    GIST_LIMITS, LIMITS, parseGistRef, validateGistSource, gistRawUrl, gistPageUrl,
    fetchGistText, rosterNamesFromCSV, encodeConfig, decodeConfig, validateConfig,
} from "../classcast.js";

const ID = "13905633547d9de4e3e21f977cee9e0c";

test("parseGistRef accepts the gist links teachers paste", () => {
    assert.deepEqual(parseGistRef(`https://gist.github.com/prof-x/${ID}`), { user: "prof-x", id: ID });
    assert.deepEqual(parseGistRef(` https://gist.github.com/prof-x/${ID}#file-roster-csv `), { user: "prof-x", id: ID });
    assert.deepEqual(parseGistRef(`https://gist.github.com/prof-x/${ID}/0123abcd`), { user: "prof-x", id: ID });
    assert.deepEqual(parseGistRef(`prof-x/${ID}`), { user: "prof-x", id: ID });
    assert.deepEqual(parseGistRef(`https://gist.githubusercontent.com/prof-x/${ID}/raw`), { user: "prof-x", id: ID });
    assert.deepEqual(parseGistRef(`https://gist.githubusercontent.com/prof-x/${ID}/raw/roster.csv`),
        { user: "prof-x", id: ID, file: "roster.csv" });
    // A pinned-revision raw link still follows the latest version of the file
    assert.deepEqual(parseGistRef(`https://gist.githubusercontent.com/prof-x/${ID}/raw/abc123def/ORF%20309.csv`),
        { user: "prof-x", id: ID, file: "ORF 309.csv" });
});

test("parseGistRef rejects non-gist and malformed links", () => {
    assert.throws(() => parseGistRef("hello"), /Paste a gist link/);
    assert.throws(() => parseGistRef(`http://gist.github.com/u/${ID}`), /https/);
    assert.throws(() => parseGistRef(`https://github.com/u/${ID}`), /isn't a gist link/);
    assert.throws(() => parseGistRef(`https://evil.example/u/${ID}/raw`), /isn't a gist link/);
    assert.throws(() => parseGistRef("https://gist.github.com/u/not-an-id"), /Gist ID/);
    assert.throws(() => parseGistRef(`-bad-/${ID}`), /owner/);
    assert.throws(() => parseGistRef(`https://gist.githubusercontent.com/u/${ID}/raw/%2E%2E`), /isn.t a gist link/);
    assert.throws(() => parseGistRef(`https://gist.githubusercontent.com/u/${ID}/raw/a%2Fb`), /file name/);
});

test("gist URLs are built from validated parts and encoded", () => {
    assert.equal(gistRawUrl({ user: "u", id: ID }), `https://gist.githubusercontent.com/u/${ID}/raw`);
    assert.equal(gistRawUrl({ user: "u", id: ID, file: "a b?.csv" }),
        `https://gist.githubusercontent.com/u/${ID}/raw/a%20b%3F.csv`);
    assert.equal(gistPageUrl({ user: "u", id: ID, file: "x" }), `https://gist.github.com/u/${ID}`);
});

test("a gist roster round-trips through a class link instead of names", async () => {
    const config = {
        gist: { user: "prof-x", id: ID, file: "roster.csv", hasHeader: true, column: 1 },
        baseUrl: "https://x.edu/vdo",
        password: "pw",
    };
    const encoded = await encodeConfig({ ...config, names: ["ignored"] });
    assert.deepEqual(await decodeConfig(encoded), config);
    assert.ok(encoded.length < 200, `gist link should be short, got ${encoded.length}`);
});

test("validateGistSource and validateConfig reject damaged gist data", () => {
    const good = { u: "u", i: ID, h: 1, c: 0 };
    assert.deepEqual(validateGistSource(good), { user: "u", id: ID, hasHeader: true, column: 0 });
    for (const bad of [null, [], "u/x", { ...good, u: 3 }, { ...good, i: "zz" }, { ...good, h: true },
        { ...good, c: -1 }, { ...good, c: 1.5 }, { ...good, c: GIST_LIMITS.maxColumn + 1 }, { ...good, f: "../x" }]) {
        assert.throws(() => validateGistSource(bad), /damaged|not valid/, JSON.stringify(bad));
    }
    assert.throws(() => validateConfig({ v: 1, n: ["A"], g: good }), /both a roster and a gist/);
});

/**
 * @param {number} status
 * @param {string} body
 * @param {Record<string, string>} [headers]
 * @returns {{ fetchImpl: typeof fetch, calls: Array<{ url: string, init: RequestInit | undefined }> }}
 */
function mockFetch(status, body, headers = {}) {
    /** @type {Array<{ url: string, init: RequestInit | undefined }>} */
    const calls = [];
    const fetchImpl = /** @type {typeof fetch} */ (async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(body, { status, headers });
    });
    return { fetchImpl, calls };
}

test("fetchGistText fetches the raw URL without credentials or referrer", async () => {
    const { fetchImpl, calls } = mockFetch(200, "Name\nAlice\n");
    assert.equal(await fetchGistText({ user: "u", id: ID, file: "r.csv" }, fetchImpl), "Name\nAlice\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://gist.githubusercontent.com/u/${ID}/raw/r.csv`);
    assert.equal(calls[0].init?.credentials, "omit");
    assert.equal(calls[0].init?.referrerPolicy, "no-referrer");
    assert.equal(calls[0].init?.redirect, "error");
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test("fetchGistText reports missing gists, HTTP errors and network failures", async () => {
    await assert.rejects(fetchGistText({ user: "u", id: ID }, mockFetch(404, "").fetchImpl), /not found/);
    await assert.rejects(fetchGistText({ user: "u", id: ID }, mockFetch(503, "").fetchImpl), /HTTP 503/);
    const offline = /** @type {typeof fetch} */ (async () => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(fetchGistText({ user: "u", id: ID }, offline), /Couldn't reach GitHub/);
});

test("fetchGistText refuses oversized gists, declared or actual", async () => {
    const big = "x".repeat(GIST_LIMITS.maxBytes + 1);
    await assert.rejects(fetchGistText({ user: "u", id: ID }, mockFetch(200, big).fetchImpl), /too large/);
    await assert.rejects(fetchGistText({ user: "u", id: ID },
        mockFetch(200, "small", { "content-length": String(GIST_LIMITS.maxBytes + 1) }).fetchImpl), /too large/);
});

test("rosterNamesFromCSV reads the chosen column and enforces limits", () => {
    assert.deepEqual(rosterNamesFromCSV("ID,Name\n1, Alice \n2,\n3,Bob‮\n", { hasHeader: true, column: 1 }), ["Alice", "Bob"]);
    assert.throws(() => rosterNamesFromCSV("Name\n", { hasHeader: true, column: 0 }), /No names/);
    assert.throws(() => rosterNamesFromCSV("A,B\n", { hasHeader: false, column: 5 }), /No names/);
    const many = Array.from({ length: LIMITS.maxStudents + 1 }, (_, i) => `S${i}`).join("\n");
    assert.throws(() => rosterNamesFromCSV(many, { hasHeader: false, column: 0 }), /limit is/);
});
