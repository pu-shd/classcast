import { test, expect } from "@playwright/test";

/** @param {string} name @param {string} text */
const csv = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

/** @param {import("@playwright/test").Page} page */
async function rows(page) {
    return page.locator(".student-row .student-name").evaluateAll(
        (els) => els.map((el) => el.firstChild?.textContent ?? ""));
}

/** @param {import("@playwright/test").Page} page */
async function shareHrefs(page) {
    return page.locator("a.btn-share").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
}

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
});

test("a fresh page shows numbered seats and a session-only link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".student-row")).toHaveCount(20);
    const seats = await rows(page);
    expect([seats[0], seats[19]]).toEqual(["Student 001", "Student 020"]);
    expect((await shareHrefs(page))[19]).toMatch(/\?push=uc_[a-z0-9]+_student_020&/);
    await expect(page).toHaveURL(/#session=[a-z0-9]{10}$/);
    await expect(page.locator("#classLink")).toHaveValue(page.url());
    await expect(page.locator("#setup")).toHaveAttribute("open", "");
});

test("an imported roster travels in the class link to another browser", async ({ page, browser }) => {
    await page.goto("/");
    await page.fill("#roomPassword", "s3cret pw");
    await page.fill("#baseUrl", "https://pu-shd.github.io/classcast/vdo.ninja/");
    await page.setInputFiles("#csvFile", csv("roster.csv", "ID,Student Name,Major\n1,Seán Ó Briain,Math\n2,王小明,CS\n3,Ana,Bio\n4,Ana,Art\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 4 students/);
    await expect(page).toHaveURL(/&d=z[A-Za-z0-9_-]+$/);
    const classLink = await page.locator("#classLink").inputValue();
    const teacherHrefs = await shareHrefs(page);

    // A student's fresh browser, with nothing stored locally.
    const other = await (await browser.newContext()).newPage();
    other.on("pageerror", (err) => { throw err; });
    await other.goto(classLink);
    await expect(other.locator(".student-row")).toHaveCount(4);
    expect(await rows(other)).toEqual(["Seán Ó Briain", "王小明", "Ana", "Ana"]);
    expect(await shareHrefs(other)).toEqual(teacherHrefs);
    expect(teacherHrefs[3]).toMatch(/^https:\/\/pu-shd\.github\.io\/classcast\/vdo\.ninja\/\?push=uc_[a-z0-9]+_ana_2&.*&password=s3cret%20pw$/);
    await expect(other.locator("#setup")).not.toHaveAttribute("open", "");
    await expect(other.locator("#roomPassword")).toHaveValue("s3cret pw");
    await expect(other).toHaveURL(classLink);
});

test("an invalid base URL is refused and the links keep the last good one", async ({ page }) => {
    await page.goto("/");
    await page.fill("#baseUrl", "javascript:alert(1)//");
    await expect(page.locator("#configStatus")).toHaveText(/must start with https/);
    expect((await shareHrefs(page))[0]).toMatch(/^https:\/\/vdo\.ninja\/\?push=/);
});

test("a damaged link shows an error instead of a roster", async ({ page }) => {
    await page.goto("/#session=abc123&d=zNOT-A-REAL-ROSTER");
    await expect(page.locator("#linkError")).toBeVisible();
    await expect(page.locator("#linkError")).toHaveText(/damaged.*check the class link/);
    await expect(page.locator(".student-row")).toHaveCount(0);
});

test("a link that tries to set a script base URL is rejected", async ({ page }) => {
    // {"v":1,"n":["A"],"b":"javascript:alert(1)//"} as an uncompressed j-link
    const data = "j" + Buffer.from(JSON.stringify({ v: 1, n: ["A"], b: "javascript:alert(1)//" })).toString("base64url");
    await page.goto(`/#session=abc123&d=${data}`);
    await expect(page.locator("#linkError")).toHaveText(/https/);
    await expect(page.locator("a.btn-share")).toHaveCount(0);
});

test("hostile names in a CSV render as text", async ({ page }) => {
    await page.goto("/");
    const evil = '<img src=x onerror="window.pwned=1">';
    await page.setInputFiles("#csvFile", csv("evil.csv", `Name\n"${evil.replace(/"/g, '""')}"\nBob\n`));
    await expect(page.locator(".student-row")).toHaveCount(2);
    expect(await rows(page)).toEqual([evil, "Bob"]);
    await expect(page.locator("#studentList img")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
});

test("old session-only links keep working with the same stream IDs", async ({ page }) => {
    await page.goto("/#session=abc123");
    await expect(page.locator(".student-row")).toHaveCount(20);
    expect((await shareHrefs(page))[0]).toMatch(/\?push=uc_abc123_student_001&/);
    await expect(page).toHaveURL(/#session=abc123$/);
});

test("pasting a different class link into the tab loads it", async ({ page }) => {
    await page.goto("/#session=abc123");
    const data = "j" + Buffer.from(JSON.stringify({ v: 1, n: ["Zed"] })).toString("base64url");
    await page.evaluate((d) => { location.hash = `session=zzz999&d=${d}`; }, data);
    await expect(page.locator(".student-row")).toHaveCount(1);
    expect(await rows(page)).toEqual(["Zed"]);
});

test("the heading defaults to ClassCast, shown as written", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("ClassCast");
    await expect(page.locator("h1")).toHaveCSS("text-transform", "none");
    await expect(page).toHaveTitle("ClassCast - Classroom Screen Share");
});

test("a class title set by the teacher travels in the link", async ({ page, browser }) => {
    await page.goto("/");
    await page.fill("#classTitle", "ORF 309 Screen Share");
    await expect(page.locator("h1")).toHaveText("ORF 309 Screen Share");
    await expect(page).toHaveTitle("ORF 309 Screen Share - ClassCast");
    await expect(page).toHaveURL(/&d=z/);
    const classLink = await page.locator("#classLink").inputValue();

    const other = await (await browser.newContext()).newPage();
    other.on("pageerror", (err) => { throw err; });
    await other.goto(classLink);
    await expect(other.locator("h1")).toHaveText("ORF 309 Screen Share");
    await expect(other).toHaveTitle("ORF 309 Screen Share - ClassCast");
    await expect(other.locator("#classTitle")).toHaveValue("ORF 309 Screen Share");

    await page.fill("#classTitle", "");
    await expect(page.locator("h1")).toHaveText("ClassCast");
    await expect(page).toHaveURL(/#session=[a-z0-9]+$/);
});

test("a hostile title renders as text", async ({ page }) => {
    const evil = '<img src=x onerror="window.pwned=1">';
    const data = "j" + Buffer.from(JSON.stringify({ v: 1, t: evil })).toString("base64url");
    await page.goto(`/#session=abc123&d=${data}`);
    await expect(page.locator("h1")).toHaveText(evil);
    await expect(page.locator("h1 img")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
});
