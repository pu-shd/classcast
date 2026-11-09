import { test, expect } from "@playwright/test";

const ID = "13905633547d9de4e3e21f977cee9e0c";
const RAW = `https://gist.githubusercontent.com/prof-x/${ID}/raw`;

/**
 * Serve a fake gist; every other request outside the test server is refused.
 * @param {import("@playwright/test").BrowserContext} context
 * @param {() => { status: number, body: string }} reply
 */
async function fakeGist(context, reply) {
    const seen = /** @type {string[]} */ ([]);
    await context.route(/^https?:\/\/(?!127\.0\.0\.1:4173\/)/, async (route) => {
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

/** @param {import("@playwright/test").Page} page */
const names = (page) => page.locator(".student-row .student-name").evaluateAll(
    (els) => els.map((el) => el.firstChild?.textContent ?? ""));

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
});

test("a gist roster gives a short link that follows later edits to the gist", async ({ page, browser }) => {
    let roster = "ID,Student Name\n1,Alice Chen\n2,Bob Martinez\n";
    const seen = await fakeGist(page.context(), () => ({ status: 200, body: roster }));
    await page.goto("/");
    await page.fill("#gistUrl", `https://gist.github.com/prof-x/${ID}`);
    await page.click("#loadGist");
    await expect(page.locator("#csvStatus")).toHaveText(/Imported 2 students from the gist/);
    expect(await names(page)).toEqual(["Alice Chen", "Bob Martinez"]);
    expect(seen).toEqual([RAW]);
    const classLink = await page.locator("#classLink").inputValue();
    expect(classLink.length).toBeLessThan(250);
    await expect(page.locator("#linkStatus")).toHaveText(/read from your gist/);

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
    const share = (/** @type {import("@playwright/test").Page} */ p) =>
        p.locator("a.btn-share").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
    expect((await share(student)).slice(0, 2)).toEqual(await share(page));
});

test("a link to a deleted gist shows an error, not a roster", async ({ page }) => {
    await fakeGist(page.context(), () => ({ status: 404, body: "404: Not Found" }));
    const data = "j" + Buffer.from(JSON.stringify({ v: 1, g: { u: "prof-x", i: ID, h: 1, c: 0 } })).toString("base64url");
    await page.goto(`/#session=abc123&d=${data}`);
    await expect(page.locator("#linkError")).toHaveText(/not found.*check the class link/);
    await expect(page.locator(".student-row")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`d=${data}$`)); // link left intact
});

test("a non-gist URL is refused before any request is made", async ({ page }) => {
    const seen = await fakeGist(page.context(), () => ({ status: 200, body: "Name\nA\n" }));
    await page.goto("/");
    await page.fill("#gistUrl", "https://evil.example/prof-x/abc");
    await page.press("#gistUrl", "Enter");
    await expect(page.locator("#csvStatus")).toHaveText(/isn't a gist link/);
    expect(seen).toEqual([]);
    await expect(page.locator(".student-row")).toHaveCount(15);
});

test("a gist that can't be reached reports the failure", async ({ page }) => {
    await page.context().route(/gist\.githubusercontent\.com/, (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await page.fill("#gistUrl", `prof-x/${ID}`);
    await page.click("#loadGist");
    await expect(page.locator("#csvStatus")).toHaveText(/Couldn't reach GitHub/);
});
