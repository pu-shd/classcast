import { test, expect } from "@playwright/test";
import { jdata, blockWebFonts } from "./helpers.js";

// Paper Tiger kit contract (vendor/paper-tiger): Princeton chrome, a skip
// link, accessible button colors, a focus ring, and mobile-friendly layout.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => { throw err; });
    await blockWebFonts(page.context());
});

for (const path of ["./", "create.html"]) {
    test(`${path}: Princeton bar, site name, footer and skip link`, async ({ page }) => {
        await page.goto(path);
        const logo = page.locator(".pt-princeton-bar img");
        await expect(logo).toHaveAttribute("alt", "Princeton University");
        expect(await logo.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0);
        await expect(page.locator(".pt-site-name")).toHaveText("ClassCast");
        await expect(page.locator(".pt-footer")).toContainText("The Trustees of Princeton University");
        await expect(page.locator(".pt-year")).toHaveText(String(new Date().getFullYear()));
        await expect(page.locator(".pt-footer")).toHaveCSS("border-top-color", "rgb(231, 117, 0)");

        await page.keyboard.press("Tab");
        const skip = page.locator(".pt-skiplink");
        await expect(skip).toBeFocused();
        await expect(skip).toBeInViewport();
        await expect(skip).toHaveAttribute("href", "#main");
    });

    test(`${path}: no sideways scrolling on a phone`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
    });
}

test("Share buttons use dark text on orange for AA contrast", async ({ page }) => {
    await page.goto(`./#session=abc123&d=${jdata({ v: 1, n: ["Alice"] })}`);
    const share = page.locator("a.btn-share");
    await expect(share).toHaveCSS("background-color", "rgb(231, 117, 0)");
    await expect(share).toHaveCSS("color", "rgb(18, 18, 18)");
    await expect(page.locator("a.btn-view")).toHaveClass(/pt-btn--outline/);
});

test("keyboard focus shows the kit's blue focus ring", async ({ page }) => {
    await page.goto("create.html");
    await page.locator("#classTitle").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#classTitle")).toBeFocused();
    await expect(page.locator("#classTitle")).toHaveCSS("outline-color", "rgb(59, 153, 252)");
    await page.locator("#importSection > summary").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator("#importSection > summary")).toHaveCSS("outline-style", "solid");
});

test("on a phone, each student's Share and View stay side by side", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`./#session=abc123&d=${jdata({ v: 1, n: ["Carol Johnson-Rodriguez de la Cruz", "Bob"] })}`);
    for (const row of await page.locator(".student-row").all()) {
        const share = await row.locator("a.btn-share").boundingBox();
        const view = await row.locator("a.btn-view").boundingBox();
        expect(share && view).toBeTruthy();
        if (!share || !view) return;
        expect(Math.abs(share.y - view.y)).toBeLessThan(2);
        expect(view.x).toBeGreaterThan(share.x);
    }
});
