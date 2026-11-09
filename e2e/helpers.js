// Shared helpers for the end-to-end tests.

/** @param {string} name @param {string} text */
export const csv = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

/** An uncompressed class-link data value, for hand-made links. @param {unknown} config */
export const jdata = (config) => "j" + Buffer.from(JSON.stringify(config)).toString("base64url");

/** Names listed on the class page. @param {import("@playwright/test").Page} page */
export const rowNames = (page) => page.locator(".student-row .student-name").evaluateAll(
    (els) => els.map((el) => el.firstChild?.textContent ?? ""));

/** Share hrefs on the class page. @param {import("@playwright/test").Page} page */
export const shareHrefs = (page) => page.locator("a.btn-share").evaluateAll(
    (els) => els.map((a) => a.getAttribute("href")));

/** Names in the create page's roster editor. @param {import("@playwright/test").Page} page */
export const previewNames = (page) => page.locator("#rosterList input").evaluateAll(
    (els) => els.map((el) => /** @type {HTMLInputElement} */ (el).value));

/** Open the create page's collapsed import section. @param {import("@playwright/test").Page} page */
export async function openImport(page) {
    if (!(await page.locator("#importSection").evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) {
        await page.click("#importSection > summary");
    }
}

/** Keep tests offline from Google Fonts (the kit's fonts.css imports it). @param {import("@playwright/test").BrowserContext} context */
export const blockWebFonts = (context) => context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

/** A fresh browser (no shared storage) that fails the test on page errors. @param {import("@playwright/test").Browser} browser */
export async function freshPage(browser) {
    const context = await browser.newContext();
    await blockWebFonts(context);
    const page = await context.newPage();
    page.on("pageerror", (err) => { throw err; });
    return page;
}
