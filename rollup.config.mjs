import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";

export default {
  input: [
    "playground.ts",
    "playback.ts",
    "process.ts",
    "playground2.ts",
    "ydvr-playback.ts",
    "ydgw-playback.ts",
    "h5000.ts",
  ],
  output: {
    dir: "build",
    format: "cjs",
    chunkFileNames: "chunk/[name]-[hash].js",
    banner: "#!/usr/bin/env node",
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
    commonjs(),
    json(),
  ],
};
