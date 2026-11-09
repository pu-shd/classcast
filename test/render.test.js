import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderStudentRows, renderColumnOptions } from "../classcast.js";

const HOSTILE = '<img src=x onerror="window.pwned=1">"><b>x</b>';

function dom() {
    return new JSDOM("<!DOCTYPE html><div id=c></div><select id=s></select>").window.document;
}

test("renderStudentRows shows names as text, never as markup", () => {
    const doc = dom();
    const c = /** @type {HTMLElement} */ (doc.getElementById("c"));
    renderStudentRows(c, [{ name: HOSTILE, id: "x" }], { share: (id) => `https://v/?push=${id}`, view: (id) => `https://v/?view=${id}` });
    assert.equal(c.querySelectorAll("img, b").length, 0, "hostile name created elements");
    assert.equal(c.querySelector(".student-name")?.firstChild?.textContent, HOSTILE);
});

test("renderStudentRows builds one row with Share and View links per student", () => {
    const doc = dom();
    const c = /** @type {HTMLElement} */ (doc.getElementById("c"));
    renderStudentRows(c, [{ name: "Alice", id: "alice" }, { name: "Bob", id: "bob" }],
        { share: (id) => `https://v/?push=${id}`, view: (id) => `https://v/?view=${id}` });
    const rows = c.querySelectorAll(".student-row");
    assert.equal(rows.length, 2);
    const share = /** @type {HTMLAnchorElement} */ (rows[1].querySelector("a.btn-share"));
    const view = /** @type {HTMLAnchorElement} */ (rows[1].querySelector("a.btn-view"));
    assert.equal(share.href, "https://v/?push=bob");
    assert.equal(view.href, "https://v/?view=bob");
    assert.equal(share.target, "_blank");
    assert.equal(share.rel, "noopener");
    assert.equal(rows[1].querySelector(".student-id")?.textContent, "#bob");
});

test("renderColumnOptions shows header text as text, never as markup", () => {
    const doc = dom();
    const s = /** @type {HTMLSelectElement} */ (doc.getElementById("s"));
    renderColumnOptions(s, ["ID", HOSTILE], true);
    assert.equal(s.options.length, 2);
    assert.equal(s.options[1].textContent, HOSTILE);
    assert.equal(s.options[1].value, "1");
    assert.equal(s.querySelectorAll("img, b").length, 0);
    renderColumnOptions(s, ["a", "b", "c"], false);
    assert.deepEqual([...s.options].map((o) => o.textContent), ["Column 1", "Column 2", "Column 3"]);
});
