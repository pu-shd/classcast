// Minimal static server for end-to-end tests: serves the page files only.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ALLOWED = new Set([
    "/index.html", "/create.html", "/class-page.js", "/create-page.js", "/classcast.js", "/styles.css",
    ...["tokens.css", "fonts.css", "layout.css", "header.css", "footer.css", "buttons.css", "forms.css",
        "logos/pu-logo.svg", "logos/pu-logo-stacked.svg", "logos/favicon.ico"].map((f) => `/vendor/paper-tiger/${f}`),
]);
const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".ico": "image/x-icon",
};
const port = Number(process.env.PORT ?? "4173");

createServer(async (req, res) => {
    const path = normalize(new URL(req.url ?? "/", "http://x").pathname.replace(/^\/$/, "/index.html"));
    if (!ALLOWED.has(path)) {
        res.writeHead(404).end("not found");
        return;
    }
    const body = await readFile(join(ROOT, path));
    const type = TYPES[/** @type {keyof typeof TYPES} */ (extname(path))];
    res.writeHead(200, { "content-type": type.startsWith("text/") ? `${type}; charset=utf-8` : type });
    res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`serving on http://127.0.0.1:${port}`));
