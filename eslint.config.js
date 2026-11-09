import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["vdo.ninja/", "node_modules/", "dist/", "public/", "examples/", "test-results/", "playwright-report/"] },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...globals.browser, ...globals.node },
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            eqeqeq: "error",
        },
    },
];
