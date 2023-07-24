import minimist from "minimist";
import fs from "fs";
import CalcTime from "./src/calctime";
import RealtimePlayback from "./src/realtime";
import { PassThrough, Readable, pipeline } from "stream";
import BreakLines from "./src/lines";
import ParseYDGW from "./src/ydgw";
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
    console.warn(err);
    process.exit(0);
  }
});

pipeline(
  input,
  new BreakLines(),
  new ParseYDGW(),

  new CalcTime(129029), // 129033, 129029
  new RealtimePlayback({
    // resetTime: true,
  }),

  new UDPOut("127.0.0.1", 9000),

  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    } else {
      console.log("Done");
    }
  }
);
