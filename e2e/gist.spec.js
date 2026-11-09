import { test, expect } from "@playwright/test";
import { rowNames as names, previewNames, shareHrefs, jdata, openImport, blockWebFonts } from "./helpers.js";

const ID = "13905633547d9de4e3e21f977cee9e0c";
const RAW = `https://gist.githubusercontent.com/prof-x/${ID}/raw`;

/**
 * Serve a fake gist; every other request outside the test server is refused.
 * @param {import("@playwright/test").BrowserContext} context
 * @param {() => { status: number, body: string }} reply
 */
async function fakeGist(context, reply) {
    const seen = /** @type {string[]} */ ([]);
    await context.route(/^https?:\/\/(?!127\.0\.0\.1:4173\/|fonts\.(?:googleapis|gstatic)\.com\/)/, async (route) => {
        const url = route.request().url();
        seen.push(url);
        if (url === RAW) {
            const { status, body } = reply();
            await route.fulfill({ status, body, headers: { "access-control-allow-origin": "*", "content-type": "text/plain" } });
        } else {
            await route.abort();
        }
    });
    return seen;
}


test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
    await blockWebFonts(page.context());
});

test("a gist roster gives a short link that follows later edits to the gist", async ({ page, browser }) => {
    let roster = "ID,Student Name\n1,Alice Chen\n2,Bob Martinez\n";
    const seen = await fakeGist(page.context(), () => ({ status: 200, body: roster }));
    await page.goto("/create.html");
    await openImport(page);
    await page.fill("#gistUrl", `https://gist.github.com/prof-x/${ID}`);
    await page.click("#loadGist");
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 2 students from the gist/);
    expect(await previewNames(page)).toEqual(["Alice Chen", "Bob Martinez"]);
    expect(seen).toEqual([RAW]);
    const classLink = await page.locator("#classLink").inputValue();
    expect(classLink.length).toBeLessThan(250);
    await expect(page.locator("#linkStatus")).toHaveText(/reads your gist/);

    // The teacher edits the gist; a student opens the same link later.
    roster = "ID,Student Name\n1,Alice Chen\n2,Bob Martinez\n3,Carol Johnson\n";
    const student = await (await browser.newContext()).newPage();
    student.on("pageerror", (err) => { throw err; });
    await fakeGist(student.context(), () => ({ status: 200, body: roster }));
    await student.goto(classLink);
    await expect(student.locator(".student-row")).toHaveCount(3);
    expect(await names(student)).toEqual(["Alice Chen", "Bob Martinez", "Carol Johnson"]);
    await expect(student).toHaveURL(classLink);
    // Existing students keep the same stream IDs after the edit.
    const hrefs = await shareHrefs(student);
    expect(hrefs[0]).toMatch(/_alice_chen&/);
    expect(hrefs[2]).toMatch(/_carol_johnson&/);

    // Reopening the link for editing loads the gist into the preview.
    const editor = await student.context().newPage();
    await editor.goto("/create.html");
    await editor.fill("#existingLink", classLink);
    await editor.click("#loadExisting");
    await expect(editor.locator("#csvStatus")).toHaveText(/gist lists 3 students/);
    await expect(editor.locator("#gistUrl")).toHaveValue(`https://gist.github.com/prof-x/${ID}`);
    expect(await editor.locator("#classLink").inputValue()).toBe(classLink);
    await expect(editor.locator("#importSection")).toHaveAttribute("open", "");
    // Gist names are read-only here; switching makes them editable link names.
    await expect(editor.locator("#rosterList input").first()).toHaveAttribute("readonly", "");
    await expect(editor.locator("#addStudent")).toBeHidden();
    await editor.click("#detachGist");
    await expect(editor.locator("#rosterList input").first()).not.toHaveAttribute("readonly", "");
    await editor.locator("#rosterList input").nth(2).fill("Carol J.");
    await expect(editor.locator("#linkStatus")).toHaveText(/lives in the link/);
    const detached = await editor.locator("#classLink").inputValue();
    expect(detached).not.toBe(classLink);
    roster = "ID,Student Name\n1,Changed\n";
    const later = await student.context().newPage();
    await expect.poll(async () => {
        await later.goto(await editor.locator("#classLink").inputValue());
        return names(later);
    }).toEqual(["Alice Chen", "Bob Martinez", "Carol J."]);
});

test("a link to a deleted gist shows an error, not a roster", async ({ page }) => {
    await fakeGist(page.context(), () => ({ status: 404, body: "404: Not Found" }));
    const data = jdata({ v: 1, g: { u: "prof-x", i: ID, h: 1, c: 0 } });
    await page.goto(`/#session=abc123&d=${data}`);
    await expect(page.locator("#linkError")).toHaveText(/not found.*check the class link/);
    await expect(page.locator(".student-row")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`d=${data}$`)); // link left intact
});

test("a non-gist URL is refused before any request is made", async ({ page }) => {
    const seen = await fakeGist(page.context(), () => ({ status: 200, body: "Name\nA\n" }));
    await page.goto("/create.html");
    await openImport(page);
    await page.fill("#gistUrl", "https://evil.example/prof-x/abc");
    await page.press("#gistUrl", "Enter");
    await expect(page.locator("#csvStatus")).toHaveText(/isn't a gist link/);
    expect(seen).toEqual([]);
    expect((await previewNames(page)).length).toBe(20); // untouched default seats
});

test("a gist that can't be reached reports the failure", async ({ page }) => {
    await page.context().route(/gist\.githubusercontent\.com/, (route) => route.abort("internetdisconnected"));
    await page.goto("/create.html");
    await openImport(page);
    await page.fill("#gistUrl", `prof-x/${ID}`);
    await page.click("#loadGist");
    await expect(page.locator("#csvStatus")).toHaveText(/Couldn't reach GitHub/);
});
