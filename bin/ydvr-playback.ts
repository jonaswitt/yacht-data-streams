import YdvrStream from "@canboat/canboatjs/lib/ydvr";
import { pgnToYdgwRawFormat } from "@canboat/canboatjs/lib/toPgn";
import minimist from "minimist";
import fs from "fs";
import CalcTime from "../src/streams/calctime";
import RealtimePlayback from "../src/streams/realtime";
import { Transform, pipeline } from "stream";
import UDPOut from "../src/streams/udp-out";

const argv = minimist(process.argv.slice(2), {
  alias: { a: "address", p: "port", h: "help" },
});

if (argv["help"] || !argv["address"] || !argv["port"]) {
  console.error(`Usage: ydvr-playback [-a|--address ADDRESS] [-p|--port PORT] [file]

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const input =
  argv["_"].length === 0 || argv["_"][0] === "-"
    ? process.stdin
    : fs.createReadStream(argv["_"][0]);

const address = argv["address"];
const port = Number(argv["port"]);

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

  new UDPOut(address, port),

  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    } else {
      console.log("Done");
    }
  }
);
