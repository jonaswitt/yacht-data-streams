import dgram from "dgram";
import { Parser } from "@canboat/canboatjs/lib/fromPgn";
import * as FileStreamRotator from "file-stream-rotator";
import { RawPoint } from "./types";
import { chunkToRawPoint } from "./pgn-point";
import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream";

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
        const p = chunkToRawPoint(chunk, measurement);

        if (this.onPoint != null && p != null) {
          this.onPoint(p);
        }
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
