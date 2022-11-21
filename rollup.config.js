import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import stripShebang from "rollup-plugin-strip-shebang";

export default {
  input: "playground.ts",
  output: {
    file: "build/playground.cjs",
    format: "cjs",
    inlineDynamicImports: true,
  },
  plugins: [
    esbuild({
      // All options are optional
      //   include: /\.[jt]sx?$/, // default, inferred from `loaders` option
      //   exclude: /node_modules/, // default
      //   exclude: [],
      //   sourceMap: true, // default
      minify: process.env.NODE_ENV === "production",
      target: "node16", // default, or 'es20XX', 'esnext'
      //   tsconfig: "tsconfig.json", // default
      // Add extra loaders
      loaders: {
        // Add .json files support
        // require @rollup/plugin-commonjs
        ".json": "json",
      },
    }),
    nodeResolve({
      preferBuiltins: true,
    }),
    stripShebang(),
    commonjs(),
    json(),
  ],
};
