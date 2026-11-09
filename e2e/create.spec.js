import { test, expect } from "@playwright/test";
import { csv, rowNames, shareHrefs, previewNames, freshPage, openImport, openEdit, blockWebFonts } from "./helpers.js";

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
    await blockWebFonts(page.context());
});

/** @param {import("@playwright/test").Page} page */
const classLink = (page) => page.locator("#classLink").inputValue();

test("a CSV roster and settings become a class link to the class page", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "ORF 309 Screen Share");
    await page.fill("#roomPassword", "s3cret pw");
    await page.fill("#baseUrl", "https://pu-shd.github.io/classcast/vdo.ninja/");
    await openImport(page);
    await page.setInputFiles("#csvFile", csv("roster.csv", "ID,Student Name,Major\n1,Seán Ó Briain,Math\n2,王小明,CS\n3,Ana,Bio\n4,Ana,Art\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 4 students/);
    expect(await previewNames(page)).toEqual(["Seán Ó Briain", "王小明", "Ana", "Ana"]);
    await expect(page.locator("#rosterHeading")).toHaveText("Students (4)");

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
    await expect(page.locator("#rosterHeading")).toHaveText("Students");
    expect((await previewNames(page)).length).toBe(20);
    const student = await freshPage(browser);
    await student.goto(await classLink(page));
    await expect(student.locator(".student-row")).toHaveCount(20);
    await expect(student.locator("h1")).toHaveText("Lab");
});

test("editing an existing class link keeps its session and settings", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.fill("#classTitle", "Week 1");
    await page.fill("#roomPassword", "pw");
    await openImport(page);
    await page.setInputFiles("#csvFile", csv("r.csv", "Name\nAlice\nBob\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 2/);
    const original = await classLink(page);
    const session = new URL(original).hash.match(/session=([a-z0-9]+)/)?.[1];

    const editor = await freshPage(browser);
    await editor.goto("/create.html");
    await openEdit(editor);
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
    await openImport(page);
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
    await openEdit(page);
    await page.fill("#existingLink", "not a link");
    await page.press("#existingLink", "Enter");
    await expect(page.locator("#existingStatus")).toHaveText(/isn't a class link/);
});

test("a damaged link opened for editing keeps its session and says so", async ({ page }) => {
    await page.goto("/create.html#session=abc123&d=zBROKEN");
    await expect(page.locator("#editSection")).toHaveAttribute("open", "");
    await expect(page.locator("#existingStatus")).toHaveText(/damaged.*session is kept/);
    expect(await classLink(page)).toBe("http://127.0.0.1:4173/#session=abc123");
});

test("hostile names in an imported CSV stay as text", async ({ page }) => {
    const evil = '<img src=x onerror="window.pwned=1">';
    await page.goto("/create.html");
    await openImport(page);
    await page.setInputFiles("#csvFile", csv("evil.csv", `Name\n"${evil.replace(/"/g, '""')}"\nBob\n`));
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 2/);
    expect(await previewNames(page)).toEqual([evil, "Bob"]);
    await expect(page.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
});

test("the CSV and gist import is collapsed by default", async ({ page }) => {
    await page.goto("/create.html");
    await expect(page.locator("#importSection")).not.toHaveAttribute("open", "");
    await expect(page.locator("#csvFile")).toBeHidden();
    await expect(page.locator("#gistUrl")).toBeHidden();
    await page.click("#importSection > summary");
    await expect(page.locator("#csvFile")).toBeVisible();
    await expect(page.locator("#gistUrl")).toBeVisible();
});

test("names can be edited inline and travel in the link", async ({ page, browser }) => {
    await page.goto("/create.html");
    const fields = page.locator("#rosterList input");
    await expect(fields).toHaveCount(20);
    await expect(fields.nth(0)).toHaveValue("Student 001");
    await expect(page.locator("#classLink")).not.toHaveValue(/&d=/);

    await fields.nth(1).fill("Bob Martinez");
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    await expect(page.locator("#rosterHeading")).toHaveText("Students (20)");

    const student = await freshPage(browser);
    await student.goto(await page.locator("#classLink").inputValue());
    const listed = await rowNames(student);
    expect(listed.slice(0, 3)).toEqual(["Student 001", "Bob Martinez", "Student 003"]);
    expect((await shareHrefs(student))[1]).toMatch(/_bob_martinez&/);
});

test("rows can be added, removed and reset; blanks are skipped", async ({ page, browser }) => {
    await page.goto("/create.html");
    const fields = page.locator("#rosterList input");
    // Clear the numbered seats down to two named students.
    for (let i = 0; i < 18; i++) await page.locator("#rosterList .btn-remove").last().click();
    await expect(fields).toHaveCount(2);
    await fields.nth(0).fill("Alice");
    await fields.nth(1).fill("Carol");
    // Enter adds a row right after the current one and focuses it.
    await fields.nth(0).press("Enter");
    await expect(fields).toHaveCount(3);
    await expect(fields.nth(1)).toBeFocused();
    await page.keyboard.type("Bob");
    await page.click("#addStudent");
    await expect(fields).toHaveCount(4);
    await expect(fields.nth(3)).toBeFocused(); // left blank
    await expect(page.locator("#rosterHeading")).toHaveText("Students (3)");
    await expect(fields.nth(1)).toHaveAttribute("aria-label", "Student 2 name");

    const student = await freshPage(browser);
    await student.goto(await page.locator("#classLink").inputValue());
    expect(await rowNames(student)).toEqual(["Alice", "Bob", "Carol"]);

    await page.click("#resetRoster");
    await expect(fields).toHaveCount(20);
    await expect(fields.nth(0)).toHaveValue("Student 001");
    await expect(page.locator("#classLink")).not.toHaveValue(/&d=/);
});

test("clearing every name falls back to numbered seats", async ({ page }) => {
    await page.goto("/create.html");
    await page.locator("#rosterList input").first().fill("Only One");
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    for (const field of await page.locator("#rosterList input").all()) await field.fill("");
    await expect(page.locator("#classLink")).not.toHaveValue(/&d=/);
    await expect(page.locator("#linkStatus")).toHaveText(/Student 001–020/);
});

test("an imported CSV lands in the editor and can be corrected", async ({ page, browser }) => {
    await page.goto("/create.html");
    await openImport(page);
    await page.setInputFiles("#csvFile", csv("r.csv", "Name\nAlcie\nBob\n"));
    await expect(page.locator("#csvStatus")).toHaveText(/into the list above/);
    expect(await previewNames(page)).toEqual(["Alcie", "Bob"]);
    await page.locator("#rosterList input").first().fill("Alice");
    await expect(page.locator("#rosterHeading")).toHaveText("Students (2)");
    const student = await freshPage(browser);
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    // Wait until the link reflects the correction, then open it.
    await expect.poll(async () => {
        await student.goto(await page.locator("#classLink").inputValue());
        return rowNames(student);
    }).toEqual(["Alice", "Bob"]);
});

test("the page explains itself and keeps the edit field collapsed", async ({ page }) => {
    await page.goto("/create.html");
    await expect(page.locator(".cc-lede")).toHaveText(
        "Use this page to create or edit class links. Copy the class link for distribution before and use during class.");
    await expect(page.locator("#editSection")).not.toHaveAttribute("open", "");
    await expect(page.locator("#existingLink")).toBeHidden();
    await page.click("#editSection > summary");
    await expect(page.locator("#existingLink")).toBeVisible();
});

test("a class link opened for editing shows the edit section open", async ({ page, browser }) => {
    await page.goto("/create.html");
    await page.locator("#rosterList input").first().fill("Alice");
    await expect(page.locator("#classLink")).toHaveValue(/&d=z/);
    const editor = await freshPage(browser);
    await editor.goto(new URL(await page.locator("#classLink").inputValue()).hash.replace(/^/, "/create.html"));
    await expect(editor.locator("#editSection")).toHaveAttribute("open", "");
    await expect(editor.locator("#existingStatus")).toHaveText(/Editing an existing class link/);
});

test("the student list is shown in full, without its own scrollbar", async ({ page }) => {
    await page.goto("/create.html");
    for (let i = 0; i < 20; i++) await page.click("#addStudent");
    const list = page.locator("#rosterList");
    await expect(list.locator("input")).toHaveCount(40);
    await expect(list).toHaveCSS("overflow-y", "visible");
    const { scroll, client } = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(scroll).toBeLessThanOrEqual(client);
});
