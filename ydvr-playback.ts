import YdvrStream from "@canboat/canboatjs/lib/ydvr";
import { pgnToYdgwRawFormat } from "@canboat/canboatjs/lib/toPgn";
import minimist from "minimist";
import fs from "fs";
import CalcTime from "./src/calctime";
import RealtimePlayback from "./src/realtime";
import { PassThrough, Readable, Transform, pipeline } from "stream";
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
  new YdvrStream() as unknown as Transform,

  new CalcTime(129029), // 129033, 129029
  new RealtimePlayback({
    // resetTime: true,
  }),

  new Transform({
    objectMode: true,
    transform: (data, _, cb) => {
      const t = new Date().toISOString().slice(11, -1);
      cb(null, {
        ...data,
        input: pgnToYdgwRawFormat(data).map((l) => `${t} R ${l}`),
      });
    },
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
