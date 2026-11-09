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

/** Names in the create page's preview. @param {import("@playwright/test").Page} page */
export const previewNames = (page) => page.locator("#preview li").allTextContents();

/** A fresh browser (no shared storage) that fails the test on page errors. @param {import("@playwright/test").Browser} browser */
export async function freshPage(browser) {
    const page = await (await browser.newContext()).newPage();
    page.on("pageerror", (err) => { throw err; });
    return page;
}
