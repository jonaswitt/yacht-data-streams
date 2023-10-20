#!/usr/bin/env node

import minimist from "minimist";
import { UDPYDGWInput } from "../src/udp-ydgw-input";

const argv = minimist(process.argv.slice(2), {
  alias: { p: "port", h: "help" },
});

if (argv["help"] || !argv["port"]) {
  console.error(`Usage: ydwg-tail [-p|--port PORT] 

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const input = new UDPYDGWInput({
  port: Number(argv["port"]),
});

input.onPoint = (point) => {
  for (const [key, value] of Object.entries(point.fields)) {
    console.log(
      `${point.timestamp.toISOString()}\t${JSON.stringify(key)}\t${value}`
    );
  }
};
