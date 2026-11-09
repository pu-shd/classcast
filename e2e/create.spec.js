import { test, expect } from "@playwright/test";
import { csv, rowNames, shareHrefs, previewNames, freshPage } from "./helpers.js";

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
});

/** @param {import("@playwright/test").Page} page */
const classLink = (page) => page.locator("#classLink").inputValue();

test("a CSV roster and settings become a class link to the class page", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "ORF 309 Screen Share");
    await page.fill("#roomPassword", "s3cret pw");
    await page.fill("#baseUrl", "https://pu-shd.github.io/classcast/vdo.ninja/");
    await page.setInputFiles("#csvFile", csv("roster.csv", "ID,Student Name,Major\n1,Seán Ó Briain,Math\n2,王小明,CS\n3,Ana,Bio\n4,Ana,Art\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 4 students/);
    expect(await previewNames(page)).toEqual(["Seán Ó Briain", "王小明", "Ana", "Ana"]);
    await expect(page.locator("#previewHeading")).toHaveText("Roster preview (4 students)");

    const link = await classLink(page);
    expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4173\/#session=[a-z0-9]{10}&d=z[A-Za-z0-9_-]+$/);
    await expect(page.locator("#openLink")).toHaveAttribute("href", link);

    const student = await freshPage(browser);
    await student.goto(link);
    expect(await rowNames(student)).toEqual(["Seán Ó Briain", "王小明", "Ana", "Ana"]);
    await expect(student.locator("h1")).toHaveText("ORF 309 Screen Share");
    expect((await shareHrefs(student))[3]).toMatch(
        /^https:\/\/pu-shd\.github\.io\/classcast\/vdo\.ninja\/\?push=uc_[a-z0-9]+_ana_2&.*&password=s3cret%20pw$/);
    await expect(student.locator("input")).toHaveCount(0);
});

test("with no roster, the link gives numbered seats and keeps the title", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "Lab");
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    await expect(page.locator("#linkStatus")).toHaveText(/Student 001–020/);
    await expect(page.locator("#previewHeading")).toHaveText("Roster preview: Student 001–020");
    const student = await freshPage(browser);
    await student.goto(await classLink(page));
    await expect(student.locator(".student-row")).toHaveCount(20);
    await expect(student.locator("h1")).toHaveText("Lab");
});

test("editing an existing class link keeps its session and settings", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "Week 1");
    await page.fill("#roomPassword", "pw");
    await page.setInputFiles("#csvFile", csv("r.csv", "Name\nAlice\nBob\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 2/);
    const original = await classLink(page);
    const session = new URL(original).hash.match(/session=([a-z0-9]+)/)?.[1];

    const editor = await freshPage(browser);
    await editor.goto("/create.html");
    await editor.fill("#existingLink", original);
    await editor.click("#loadExisting");
    await expect(editor.locator("#existingStatus")).toHaveText(/Editing an existing class link/);
    await expect(editor.locator("#classTitle")).toHaveValue("Week 1");
    await expect(editor.locator("#roomPassword")).toHaveValue("pw");
    expect(await previewNames(editor)).toEqual(["Alice", "Bob"]);
    expect(await classLink(editor)).toBe(original);

    await editor.fill("#classTitle", "Week 2");
    await expect(editor.locator("#classLink")).not.toHaveValue(original);
    const edited = await classLink(editor);
    expect(edited).toContain(`#session=${session}&`);
    const student = await freshPage(browser);
    await student.goto(edited);
    await expect(student.locator("h1")).toHaveText("Week 2");
    expect(await rowNames(student)).toEqual(["Alice", "Bob"]);
});

test("a refresh keeps the draft", async ({ page }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "Draft");
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    await page.setInputFiles("#csvFile", csv("r.csv", "Name\nAlice\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 1/);
    const link = await classLink(page);
    await page.reload();
    await expect(page.locator("#classTitle")).toHaveValue("Draft");
    expect(await previewNames(page)).toEqual(["Alice"]);
    expect(await classLink(page)).toBe(link);
});

test("bad input is refused: base URL, pasted link", async ({ page }) => {
    await page.goto("/create.html");
    const before = await classLink(page);
    await page.fill("#baseUrl", "javascript:alert(1)//");
    await expect(page.locator("#configStatus")).toHaveText(/must start with https/);
    expect(await classLink(page)).toBe(before);
    await page.fill("#existingLink", "not a link");
    await page.press("#existingLink", "Enter");
    await expect(page.locator("#existingStatus")).toHaveText(/isn't a class link/);
});

test("a damaged link opened for editing keeps its session and says so", async ({ page }) => {
    await page.goto("/create.html#session=abc123&d=zBROKEN");
    await expect(page.locator("#existingStatus")).toHaveText(/damaged.*session is kept/);
    expect(await classLink(page)).toBe("http://127.0.0.1:4173/#session=abc123");
});

test("hostile names in a CSV preview render as text", async ({ page }) => {
    const evil = '<img src=x onerror="window.pwned=1">';
    await page.goto("/create.html");
    await page.setInputFiles("#csvFile", csv("evil.csv", `Name\n"${evil.replace(/"/g, '""')}"\nBob\n`));
    expect(await previewNames(page)).toEqual([evil, "Bob"]);
    await expect(page.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
});
