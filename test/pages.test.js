import { test } from "node:test";
import assert from "node:assert/strict";
import { classLinkUrl, parseClassLink, loadRosterNames } from "../classcast.js";

const ID = "13905633547d9de4e3e21f977cee9e0c";

test("classLinkUrl points at the class page next to the create page", () => {
    assert.equal(classLinkUrl("https://pu-shd.github.io/classcast/create.html", "abc123", "zAB"),
        "https://pu-shd.github.io/classcast/#session=abc123&d=zAB");
    assert.equal(classLinkUrl("http://127.0.0.1:4173/create.html#session=old", "abc123", null),
        "http://127.0.0.1:4173/#session=abc123");
});

test("parseClassLink reads a pasted class link's session and data", () => {
    assert.deepEqual(parseClassLink(" https://pu-shd.github.io/classcast/#session=abc123&d=zAB "),
        { session: "abc123", data: "zAB" });
    assert.deepEqual(parseClassLink("https://x.edu/index.html#session=abc123"), { session: "abc123", data: null });
});

test("parseClassLink rejects things that aren't class links", () => {
    assert.throws(() => parseClassLink("hello"), /isn't a class link/);
    assert.throws(() => parseClassLink("https://x.edu/"), /isn't a class link/);
    assert.throws(() => parseClassLink("https://x.edu/#d=zAB"), /isn't a class link/);
    assert.throws(() => parseClassLink("javascript:alert(1)#session=abc123"), /isn't a class link/);
});

test("loadRosterNames returns link names, gist names, or null for default seats", async () => {
    const never = /** @type {typeof fetch} */ (async () => { throw new Error("should not fetch"); });
    assert.deepEqual(await loadRosterNames({ names: ["A", "B"] }, never), ["A", "B"]);
    assert.equal(await loadRosterNames({ title: "T" }, never), null);
    /** @type {string[]} */
    const urls = [];
    const gistFetch = /** @type {typeof fetch} */ (async (url) => {
        urls.push(String(url));
        return new Response("ID,Name\n1,Alice\n2,Bob\n");
    });
    const gist = { user: "u", id: ID, hasHeader: true, column: 1 };
    assert.deepEqual(await loadRosterNames({ gist }, gistFetch), ["Alice", "Bob"]);
    assert.deepEqual(urls, [`https://gist.githubusercontent.com/u/${ID}/raw`]);
    const missing = /** @type {typeof fetch} */ (async () => new Response("", { status: 404 }));
    await assert.rejects(loadRosterNames({ gist }, missing), /not found/);
});

test("rosterFromEditor: cleaned names, or null when it means the default seats", async () => {
    const { rosterFromEditor, defaultStudents, LIMITS } = await import("../classcast.js");
    assert.deepEqual(rosterFromEditor([" Alice ", "", "  ", "Bob‮"]), ["Alice", "Bob"]);
    assert.equal(rosterFromEditor([]), null);
    assert.equal(rosterFromEditor(["", " "]), null);
    const seats = defaultStudents().map((s) => s.name);
    assert.equal(rosterFromEditor(seats), null, "unchanged default seats stay out of the link");
    assert.equal(rosterFromEditor([...seats, ""]), null);
    assert.deepEqual(rosterFromEditor(seats.slice(0, 19)), seats.slice(0, 19));
    assert.deepEqual(rosterFromEditor(["Student 001"]), ["Student 001"]);
    assert.throws(() => rosterFromEditor(Array(LIMITS.maxStudents + 1).fill("A")), /limit is/);
});
