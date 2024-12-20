import dgram from "dgram";
import { Parser } from "@canboat/canboatjs/lib/fromPgn";
import pgns from "@canboat/pgns";
import { entries, size } from "lodash";
import * as FileStreamRotator from "file-stream-rotator";
import { RawPoint } from "./types";
import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream";

const PGNS = pgns.PGNs.reduce((acc, pgn) => {
  acc[pgn.PGN] = {
    ...pgn,
    NamedFields: (pgn.Fields as Array<{ Name: string }>)?.reduce(
      (acc, field) => {
        acc[field.Name] = field;
        return acc;
      },
      {}
    ),
  };
  return acc;
}, {});

export class UDPYDGWInput {
  private socket: dgram.Socket;

  private parser: any;

  private logStream:
    | ReturnType<(typeof FileStreamRotator)["getStream"]>
    | undefined;

  public onPoint: ((point: RawPoint) => void) | undefined;

  constructor({
    port,
    measurement = "nmea",
    logFile,
  }: {
    port: number;
    measurement?: string;
    logFile?: Parameters<(typeof FileStreamRotator)["getStream"]>[0] & {
      gzip?: boolean;
    };
  }) {
    if (logFile != null) {
      const { gzip, ...options } = logFile;
      this.logStream = FileStreamRotator.getStream(options);
      if (gzip) {
        this.logStream.on("rotate", function (oldFile, newFile) {
          const gzip = createGzip();
          const source = createReadStream(oldFile);
          const destination = createWriteStream(oldFile + ".gz");
          pipeline(source, gzip, destination, (err) => {
            if (!err) {
              unlink(oldFile);
            }
          });
        });
      }
    }

    this.parser = new Parser();
    this.parser.on("error", (pgn, error) => {
      console.error(`Error parsing ${pgn.pgn} ${error}`);
      console.error(error.stack);
    });

    this.socket = dgram.createSocket({
      type: "udp4",
      reuseAddr: true,
    });
    this.socket.on("message", (msg, info) => {
      const msgString = msg.toString("ascii");

      const chunk = this.parser.parseYDGW02(msgString.trim());
      if (chunk) {
        const p: RawPoint = {
          measurement,
          tags: {
            pgn: chunk.pgn.toString(),
            source: chunk.src.toString(),
          },
          fields: {},
        };

        const reference = chunk.fields?.Reference;
        for (let [key, value] of entries(chunk.fields)) {
          if (!(typeof value === "number" && !Number.isNaN(value))) {
            continue;
          }
          if (key === "SID" || key === "Reference") {
            continue;
          }

          let unit = PGNS[chunk.pgn]?.NamedFields[key]?.Units;

          if (unit === "rad") {
            value = value * (180 / Math.PI);
            unit = "deg";
          } else if (unit === "rad/s") {
            value = value * (180 / Math.PI);
            unit = "deg/s";
          } else if (unit === "m/s") {
            value = value * 1.9438444924574;
            unit = "kn";
          }

          let fieldName = [key, reference, unit]
            .filter((x) => x != null)
            .join(", ");

          if (typeof value === "number" && !Number.isNaN(value)) {
            p.fields[fieldName] = value;
          } else if (typeof value === "string") {
            p.fields[fieldName] = value;
          }
        }

        if (this.onPoint != null && size(p.fields) > 0) {
          this.onPoint(p);
        }

        // console.log(p.toLineProtocol(), p.fields);
      }

      if (this.logStream != null) {
        this.logStream.write(msgString);
      }
    });
    this.socket.bind(port);
    console.log("Listening on UDP port", port);
  }

  public close() {
    this.socket.close();
  }
}
