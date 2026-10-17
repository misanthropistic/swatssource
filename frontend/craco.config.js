const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Jest (v27, via react-scripts) needs two mappings that webpack gets for free:
  //   - the "@" alias, otherwise components importing "@/..." cannot load;
  //   - "react-router/dom", because Jest 27 predates package `exports` subpath
  //     maps and cannot see react-router v7's conditional entry points.
  jest: {
    configure: {
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        // Point straight at the CommonJS dev build. require.resolve() would pick
        // the .mjs variant (Node prefers the `module-sync` condition), which
        // Jest 27 cannot parse.
        "^react-router/dom$": "<rootDir>/node_modules/react-router/dist/development/dom-export.js",
      },
    },
  },
};
