#!/usr/bin/env node

import minimist from "minimist";
import { VictronMQTTInput } from "../src/victron-mqtt-input";

const argv = minimist(process.argv.slice(2), {
  alias: { c: "clientId", h: "help" },
});

if (argv["help"] || !argv._[0]) {
  console.error(`Usage: victron-tail [-c|--clientId CLIENTID] [mqtt://host:port]

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const input = new VictronMQTTInput({
  url: argv._[0],
  clientId: argv["clientId"] ?? "victron-tail",
});

input.onPoint = (point) => {
  for (const [key, value] of Object.entries(point.fields)) {
    console.log(
      `${(point.timestamp ?? new Date()).toISOString()}\t${JSON.stringify(
        key
      )}\t${value}`
    );
  }
};
