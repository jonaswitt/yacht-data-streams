import dgram from "dgram";
import { Parser } from "@canboat/canboatjs/lib/fromPgn";
import pgns from "@canboat/pgns";
import { entries, size } from "lodash";
import * as FileStreamRotator from "file-stream-rotator";
import { RawPoint } from "./types";

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

const logStream = FileStreamRotator.getStream({
  filename: "log/test.%DATE%",
  frequency: "hourly",
  date_format: "YYYY-MM-DD_HH-mm",
  size: "10M",
  max_logs: "5d",
  extension: ".log",
  //   utc: true,
  audit_file: "log/audit.json",
  create_symlink: true,
});

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
    logFile?: Parameters<(typeof FileStreamRotator)["getStream"]>[0];
  }) {
    if (logFile != null) {
      this.logStream = FileStreamRotator.getStream(logFile);
    }

    this.parser = new Parser();
    this.parser.on("error", (pgn, error) => {
      console.error(`Error parsing ${pgn.pgn} ${error}`);
      console.error(error.stack);
    });

    this.socket = dgram.createSocket("udp4");
    this.socket.on("message", (msg, info) => {
      const msgString = msg.toString("ascii");

      const chunk = this.parser.parseYDGW02(msgString.trim());
      if (chunk) {
        const p: RawPoint = {
          measurement,
          timestamp: new Date(),
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
