import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "e2e",
    forbidOnly: true,
    reporter: "list",
    use: { baseURL: "http://127.0.0.1:4173" },
    projects: [
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    ],
    webServer: {
        command: "node e2e/serve.js",
        url: "http://127.0.0.1:4173/",
        reuseExistingServer: false,
    },
});
