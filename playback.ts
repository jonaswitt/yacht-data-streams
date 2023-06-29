import minimist from "minimist";
import fs from "fs";
import CalcTime from "./src/calctime";
import RealtimePlayback from "./src/realtime";
import ParseYDGW from "./src/ydgw";
import { pipeline } from "stream";
import BreakLines from "./src/lines";
import UDPOut from "./src/udp-out";

const argv = minimist(process.argv.slice(2), {
  alias: { h: "help" },
});

if (argv["help"]) {
  console.error(`Usage: ${process.argv[0]} [file]

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const input =
  argv["_"].length === 0 || argv["_"][0] === "-"
    ? process.stdin
    : fs.createReadStream(argv["_"][0]);

process.stdout.on("error", (err) => {
  if (err.code == "EPIPE") {
    process.exit(0);
  }
});

pipeline(
  input,

  // For YDWG input
  new BreakLines(),
  new ParseYDGW(),

  new CalcTime(129033),
  new RealtimePlayback({
    // resetTime: true,
  }),
  new UDPOut("127.0.0.1", 9000),

  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }
);
