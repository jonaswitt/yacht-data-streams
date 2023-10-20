#!/usr/bin/env node

import minimist from "minimist";
import { H5000Input } from "../src/h5000-input";

const argv = minimist(process.argv.slice(2), {
  alias: { h: "help" },
});

if (argv["help"] || !argv._[0]) {
  console.error(`Usage: h5000-tail [ws://host:port]

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const input = new H5000Input({
  url: argv._[0],
});

input.onPoint = (point) => {
  for (const [key, value] of Object.entries(point.fields)) {
    console.log(
      `${point.timestamp.toISOString()}\t${JSON.stringify(key)}\t${value}`
    );
  }
};
