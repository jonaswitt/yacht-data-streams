#!/usr/bin/env node

import minimist from "minimist";
import { Controller } from "../src/controller";

const argv = minimist(process.argv.slice(2), {
  alias: { c: "config", h: "help" },
});

if (argv["help"]) {
  console.error(`Usage: yacht-data-streams [-c|--config CONFIG_FILE]
  
  Options:
    -c, --config     path to config.toml file (defaults to ./config.toml)
    -h, --help       output usage information`);
  process.exit(1);
}

new Controller(argv.config ?? "config.toml");
