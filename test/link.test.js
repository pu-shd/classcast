import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
    LIMITS, DEFAULT_BASE_URL, cleanText, normalizeBaseUrl, isValidSession, newSessionId,
    validateConfig, encodeConfig, decodeConfig, parseHash, buildHash,
} from "../classcast.js";

const b64 = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString("base64url");
const zlink = (/** @type {unknown} */ obj) => "z" + b64(deflateRawSync(JSON.stringify(obj)));
const jlink = (/** @type {unknown} */ obj) => "j" + b64(Buffer.from(JSON.stringify(obj)));

test("encode/decode round-trips names, base URL and password", async () => {
    const config = {
        names: ["Alice Chen", "Seán Ó Briain", "José Núñez", "王小明", "Zoë 🎓"],
        baseUrl: "https://pu-shd.github.io/classcast/vdo.ninja",
        password: "p&ss w0rd",
    };
    const encoded = await encodeConfig(config);
    assert.match(encoded, /^z[A-Za-z0-9_-]+$/);
    assert.deepEqual(await decodeConfig(encoded), config);
});

test("encode omits the default base URL and empty password", async () => {
    const encoded = await encodeConfig({ names: ["A"], baseUrl: DEFAULT_BASE_URL, password: "" });
    assert.deepEqual(await decodeConfig(encoded), { names: ["A"] });
});

test("a 40-student roster fits comfortably in a link", async () => {
    const names = Array.from({ length: 40 }, (_, i) => `Firstname${i} Lastname${i * 7}`);
    const encoded = await encodeConfig({ names });
    assert.ok(encoded.length < 1200, `encoded length ${encoded.length}`);
    assert.deepEqual((await decodeConfig(encoded)).names, names);
});

test("uncompressed j-links decode too", async () => {
    assert.deepEqual(await decodeConfig(jlink({ v: 1, n: ["A", "B"] })), { names: ["A", "B"] });
});

test("decode rejects damaged and unknown links with a clear error", async () => {
    await assert.rejects(decodeConfig(""), /unknown format/);
    await assert.rejects(decodeConfig("x" + b64(Buffer.from("{}"))), /unknown format/);
    await assert.rejects(decodeConfig("z!!!"), /bad characters/);
    await assert.rejects(decodeConfig("z" + b64(Buffer.from("not deflate data at all"))), /cannot decompress/);
    await assert.rejects(decodeConfig("j" + b64(Buffer.from("{nope"))), /bad data/);
    await assert.rejects(decodeConfig("j" + b64(Buffer.from([0xff, 0xfe]))), /bad data/);
    // A truncated link (e.g. cut off when pasted)
    const full = await encodeConfig({ names: Array.from({ length: 30 }, (_, i) => `Student ${i}`) });
    await assert.rejects(decodeConfig(full.slice(0, full.length / 2)), /damaged/);
});

test("decode refuses oversized links and decompression bombs", async () => {
    await assert.rejects(decodeConfig("z" + "A".repeat(LIMITS.maxEncodedLength)), /too large/);
    const bomb = zlink({ v: 1, n: ["A"], pad: "x".repeat(LIMITS.maxDecodedBytes * 4) });
    assert.ok(bomb.length < LIMITS.maxEncodedLength, "bomb should be small when compressed");
    await assert.rejects(decodeConfig(bomb), /too large/);
});

test("validateConfig rejects wrong versions and malformed fields", () => {
    assert.throws(() => validateConfig(null), /not an object/);
    assert.throws(() => validateConfig([1]), /not an object/);
    assert.throws(() => validateConfig({ v: 2 }), /different version/);
    assert.throws(() => validateConfig({ v: 1, n: "Alice" }), /roster is damaged/);
    assert.throws(() => validateConfig({ v: 1, n: ["A", 3] }), /roster is damaged/);
    assert.throws(() => validateConfig({ v: 1, n: ["", "  "] }), /roster is empty/);
    assert.throws(() => validateConfig({ v: 1, n: Array(LIMITS.maxStudents + 1).fill("A") }), /more than/);
    assert.throws(() => validateConfig({ v: 1, b: 5 }), /base URL is damaged/);
    assert.throws(() => validateConfig({ v: 1, p: {} }), /password is damaged/);
});

test("validateConfig refuses script and non-https base URLs from links", () => {
    for (const b of ["javascript:alert(1)//", "data:text/html,hi", "http://evil.example", "ftp://x", "https://u:p@x.org"]) {
        assert.throws(() => validateConfig({ v: 1, b }), /base URL/, b);
    }
});

test("validateConfig cleans names: control/bidi characters, whitespace, length", () => {
    const config = validateConfig({ v: 1, n: ["  Al‮ice\u0000  Chen ", "x".repeat(500)] });
    assert.deepEqual(config.names, ["Alice Chen", "x".repeat(LIMITS.maxNameLength)]);
});

test("cleanText strips line breaks and tabs", () => {
    assert.equal(cleanText("a\r\nb\tc", 50), "a b c");
});

test("normalizeBaseUrl trims trailing slashes, query and fragment; allows localhost http", () => {
    assert.equal(normalizeBaseUrl(" https://vdo.ninja/ "), "https://vdo.ninja");
    assert.equal(normalizeBaseUrl("https://x.edu/a/vdo.ninja//?q=1#f"), "https://x.edu/a/vdo.ninja");
    assert.equal(normalizeBaseUrl("http://localhost:8080/vdo"), "http://localhost:8080/vdo");
    assert.throws(() => normalizeBaseUrl("vdo.ninja"), /not a valid URL/);
});

test("session IDs: generated ones are valid; junk is rejected", () => {
    for (let i = 0; i < 50; i++) assert.ok(isValidSession(newSessionId()));
    assert.notEqual(newSessionId(), newSessionId());
    for (const bad of [null, "", "abc", "a".repeat(33), "abc-def", "<script>"]) {
        assert.equal(isValidSession(bad), false, String(bad));
    }
});

test("parseHash/buildHash round-trip and stay compatible with old session-only links", () => {
    assert.deepEqual(parseHash("#session=abc123"), { session: "abc123", data: null });
    assert.deepEqual(parseHash(""), { session: null, data: null });
    assert.deepEqual(parseHash("#session=<x>&d=zAB"), { session: null, data: "zAB" });
    const hash = buildHash("abc123", "zAB-_c");
    assert.equal(hash, "session=abc123&d=zAB-_c");
    assert.deepEqual(parseHash("#" + hash), { session: "abc123", data: "zAB-_c" });
    assert.equal(buildHash("abc123", null), "session=abc123");
});
