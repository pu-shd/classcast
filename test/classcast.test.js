import { test } from "node:test";
import assert from "node:assert/strict";
import {
    nameToId, assignIds, parseCSV, detectNameColumn, namesFromRows, shareUrl, viewUrl, defaultStudents,
} from "../classcast.js";

test("nameToId lowercases, collapses separators, trims and caps length", () => {
    assert.equal(nameToId("Alice Chen"), "alice_chen");
    assert.equal(nameToId("  O'Brien, Seán  "), "o_brien_se_n");
    assert.equal(nameToId("x".repeat(50)).length, 30);
    assert.equal(nameToId("!!!"), "");
});

test("assignIds de-duplicates deterministically and falls back for empty IDs", () => {
    assert.deepEqual(assignIds(["Alice", "alice", " Alice ", "日本"]), [
        { name: "Alice", id: "alice" },
        { name: "alice", id: "alice_2" },
        { name: "Alice", id: "alice_3" },
        { name: "日本", id: "student" },
    ]);
});

test("parseCSV handles quotes, escaped quotes, CRLF and blank lines", () => {
    const { headers, rows } = parseCSV('Name,Note\r\n"Chen, Alice","said ""hi"""\r\n\r\nBob,\n');
    assert.deepEqual(headers, ["Name", "Note"]);
    assert.deepEqual(rows, [["Name", "Note"], ["Chen, Alice", 'said "hi"'], ["Bob", ""]]);
    assert.deepEqual(parseCSV("\n\n"), { headers: [], rows: [] });
});

test("detectNameColumn finds name/student headers or returns -1", () => {
    assert.equal(detectNameColumn(["ID", "Student Name", "Major"]), 1);
    assert.equal(detectNameColumn(["ID", "Major"]), -1);
});

test("namesFromRows honours header flag and column, dropping blanks", () => {
    const rows = [["ID", "Name"], ["1", "Alice"], ["2", "  "], ["3"], ["4", " Bob "]];
    assert.deepEqual(namesFromRows(rows, { hasHeader: true, column: 1 }), ["Alice", "Bob"]);
    assert.deepEqual(namesFromRows(rows, { hasHeader: false, column: 1 }), ["Name", "Alice", "Bob"]);
});

test("shareUrl builds a screen-only, audio-off push link with optional password", () => {
    assert.equal(
        shareUrl("https://vdo.ninja/", "uc_abc_alice", ""),
        "https://vdo.ninja/?push=uc_abc_alice&screenshare&quality=0&screensharecontenthint=detail&audiobitrate=0&noaudio",
    );
    assert.match(shareUrl("https://vdo.ninja", "s", "a&b c"), /&password=a%26b%20c$/);
});

test("viewUrl builds a high-quality scene link with optional password", () => {
    assert.equal(
        viewUrl("https://x.edu/vdo", "uc_abc_alice", "pw"),
        "https://x.edu/vdo/?view=uc_abc_alice&scene&videobitrate=12000&scale=100&sharperscreen&codec=vp9&password=pw",
    );
});

test("defaultStudents numbers placeholder seats from 001", () => {
    const seats = defaultStudents();
    assert.equal(seats.length, 20);
    assert.deepEqual(seats[0], { name: "Student 001", id: "student_001" });
    assert.deepEqual(seats[19], { name: "Student 020", id: "student_020" });
    assert.equal(new Set(seats.map((s) => s.id)).size, 20);
    assert.deepEqual(defaultStudents(2).map((s) => s.name), ["Student 001", "Student 002"]);
});
