import neostandard from "neostandard";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        ignores: ["node_modules/**", "pkg/lib/**", "dist/**"],
    },

    ...neostandard({ ts: true, semi: true }),

    {
        files: ["src/**/*.{js,jsx,ts,tsx}"],
        plugins: {
            react,
            "react-hooks": reactHooks,
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,

            indent: [
                "error",
                4,
                {
                    ObjectExpression: "first",
                    CallExpression: { arguments: "first" },
                    MemberExpression: 2,
                    ignoredNodes: ["JSXAttribute"],
                },
            ],
            "newline-per-chained-call": [
                "error",
                { ignoreChainWithDepth: 2 },
            ],
            "no-var": "error",
            "lines-between-class-members": [
                "error",
                "always",
                { exceptAfterSingleLine: true },
            ],
            "prefer-promise-reject-errors": [
                "error",
                { allowEmptyReject: true },
            ],
            "react/jsx-indent": ["error", 4],
            semi: ["error", "always", { omitLastInOneLineBlock: true }],

            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "error",

            camelcase: "off",
            "comma-dangle": "off",
            curly: "off",
            "jsx-quotes": "off",
            "key-spacing": "off",
            "no-console": "off",
            quotes: "off",
            "react/jsx-curly-spacing": "off",
            "react/jsx-indent-props": "off",
            "react/jsx-no-useless-fragment": "error",
            "react/prop-types": "off",
            "space-before-function-paren": "off",
        },
    },

    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: ["src/**/*.ts", "src/**/*.tsx"],
    })),

    eslintConfigPrettier,
];
