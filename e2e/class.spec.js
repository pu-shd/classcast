import { test, expect } from "@playwright/test";
import { jdata, rowNames, shareHrefs, blockWebFonts } from "./helpers.js";

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
    await blockWebFonts(page.context());
});

test("without a class link, the page asks for one instead of showing a roster", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#needLink")).toBeVisible();
    await expect(page.locator("#needLink")).toHaveText(/needs a class link/);
    await expect(page.locator("#studentsSection")).toBeHidden();
    await expect(page.locator(".student-row")).toHaveCount(0);
    await expect(page.locator("#createLink a")).toHaveAttribute("href", "create.html");
    await expect(page.locator("#createLink")).toBeVisible();
    await expect(page).toHaveURL(/\/$/); // no session invented
    await expect(page.locator("h1")).toHaveText("Classroom Screen Share");
    await expect(page.locator("h1")).toHaveCSS("text-transform", "none");
    await expect(page).toHaveTitle("ClassCast - Classroom Screen Share");
});

test("an old session-only link also asks for a class link", async ({ page }) => {
    await page.goto("/#session=abc123");
    await expect(page.locator("#needLink")).toBeVisible();
    await expect(page.locator(".student-row")).toHaveCount(0);
});

test("a class link with no roster shows numbered seats", async ({ page }) => {
    await page.goto(`/#session=abc123&d=${jdata({ v: 1 })}`);
    await expect(page.locator(".student-row")).toHaveCount(20);
    const seats = await rowNames(page);
    expect([seats[0], seats[19]]).toEqual(["Student 001", "Student 020"]);
    expect((await shareHrefs(page))[19]).toMatch(/\?push=uc_abc123_student_020&/);
    await expect(page.locator("#needLink")).toBeHidden();
    await expect(page.locator("#createLink")).toBeHidden();
});

test("roster data without a valid session is treated as damaged", async ({ page }) => {
    for (const hash of [`#d=${jdata({ v: 1, n: ["A"] })}`, `#session=<bad>&d=${jdata({ v: 1, n: ["A"] })}`]) {
        // A new tab per link: changing only the hash makes the page reload itself.
        const tab = await page.context().newPage();
        tab.on("pageerror", (err) => { throw err; });
        await tab.goto("/" + hash);
        await expect(tab.locator("#linkError")).toHaveText(/session.*check the class link/);
        await expect(tab.locator(".student-row")).toHaveCount(0);
        await tab.close();
    }
});

test("a class link shows only the roster: no setup tools", async ({ page }) => {
    await page.goto(`/#session=abc123&d=${jdata({ v: 1, n: ["Alice", "Bob"], t: "ORF 309", p: "pw" })}`);
    await expect(page.locator(".student-row")).toHaveCount(2);
    expect(await rowNames(page)).toEqual(["Alice", "Bob"]);
    await expect(page.locator("h1")).toHaveText("ORF 309");
    await expect(page).toHaveTitle("ORF 309 - ClassCast");
    expect((await shareHrefs(page))[1]).toMatch(/\?push=uc_abc123_bob&.*&password=pw$/);
    await expect(page.locator("input, select, textarea, button, details")).toHaveCount(0);
    await expect(page.locator("#createLink")).toBeHidden();
    expect(await page.locator("body").innerText()).not.toMatch(/class link|create|roster|csv|gist/i);
});

test("a damaged link shows an error instead of a roster", async ({ page }) => {
    await page.goto("/#session=abc123&d=zNOT-A-REAL-ROSTER");
    await expect(page.locator("#linkError")).toBeVisible();
    await expect(page.locator("#linkError")).toHaveText(/damaged.*check the class link/);
    await expect(page.locator(".student-row")).toHaveCount(0);
    await expect(page.locator("#studentsSection")).toBeHidden();
    await expect(page.locator("#createLink")).toBeHidden();
});

test("a link that tries to set a script base URL is rejected", async ({ page }) => {
    await page.goto(`/#session=abc123&d=${jdata({ v: 1, n: ["A"], b: "javascript:alert(1)//" })}`);
    await expect(page.locator("#linkError")).toHaveText(/https/);
    await expect(page.locator("a.btn-share")).toHaveCount(0);
});

test("hostile names and titles in a link render as text", async ({ page }) => {
    const evil = '<img src=x onerror="window.pwned=1">';
    await page.goto(`/#session=abc123&d=${jdata({ v: 1, n: [evil, "Bob"], t: evil })}`);
    await expect(page.locator(".student-row")).toHaveCount(2);
    expect(await rowNames(page)).toEqual([evil, "Bob"]);
    await expect(page.locator("h1")).toHaveText(evil);
    await expect(page.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
});

test("pasting a different class link into the tab loads it", async ({ page }) => {
    await page.goto("/#session=abc123");
    const data = jdata({ v: 1, n: ["Zed"] });
    await page.evaluate((d) => { location.hash = `session=zzz999&d=${d}`; }, data);
    await expect(page.locator(".student-row")).toHaveCount(1);
    expect(await rowNames(page)).toEqual(["Zed"]);
});
