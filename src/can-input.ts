import { Parser } from "@canboat/canboatjs/lib/fromPgn";
import { parseCanId, canIdString } from "@canboat/canboatjs/lib/canId";
import * as FileStreamRotator from "file-stream-rotator";
import { RawPoint } from "./types";
import { chunkToRawPoint } from "./pgn-point";
import { decodeBandGKeyValue } from "./bandg-130824";
import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream";

const RECONNECT_DELAY = 2000;

// Receive-only socketcan input. Raw CAN frames are handed to the canboatjs
// parser, which takes care of fast-packet reassembly for multi-frame PGNs.
// Unlike canboatjs' own canbus stream this does not create a CanDevice, so
// YDS stays a passive listener and never claims an address on the bus.
export class CANInput {
  private socketcan: any;

  private channel: any;

  private parser: any;

  private logStream:
    | ReturnType<(typeof FileStreamRotator)["getStream"]>
    | undefined;

  private interfaceName: string;

  private measurement: string;

  private noDataReceivedTimeout: number;

  private noDataInterval: ReturnType<typeof setInterval> | undefined;

  private reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

  private lastDataReceived: number | undefined;

  private closed = false;

  public onPoint: ((point: RawPoint) => void) | undefined;

  constructor({
    interface: interfaceName = "can0",
    measurement = "nmea",
    noDataReceivedTimeout = 0,
    logFile,
  }: {
    interface?: string;
    measurement?: string;
    noDataReceivedTimeout?: number;
    logFile?: Parameters<(typeof FileStreamRotator)["getStream"]>[0] & {
      gzip?: boolean;
    };
  }) {
    this.interfaceName = interfaceName;
    this.measurement = measurement;
    this.noDataReceivedTimeout = noDataReceivedTimeout;

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
      console.error(`Error parsing ${pgn?.pgn} ${error}`);
      console.error(error.stack);
    });

    // Loaded lazily: socketcan is a native, Linux-only optional dependency and
    // is not installable on a dev machine.
    this.socketcan = require("socketcan");

    this.connect();

    if (this.noDataReceivedTimeout > 0) {
      this.noDataInterval = setInterval(() => {
        if (
          this.channel != null &&
          this.lastDataReceived != null &&
          Date.now() - this.lastDataReceived >
            this.noDataReceivedTimeout * 1000
        ) {
          console.warn(
            `No CAN data received on ${this.interfaceName} for ${this.noDataReceivedTimeout}s, reconnecting`
          );
          this.stopChannel();
          this.connect();
        }
      }, this.noDataReceivedTimeout * 1000);
    }
  }

  private connect() {
    if (this.closed) {
      return;
    }

    try {
      // Held locally as well so the listeners below can tell whether they still
      // belong to the current channel. The no-data watchdog stops one channel
      // and immediately opens another, and a late event from the old one would
      // otherwise clear the new channel and start a duplicate, untracked
      // reader feeding the same parser.
      const channel = this.socketcan.createRawChannelWithOptions(
        this.interfaceName,
        { non_block_send: true }
      );
      this.channel = channel;

      channel.addListener("onStopped", () => {
        if (this.channel !== channel || this.closed) {
          return;
        }
        console.error(
          `CAN interface ${this.interfaceName} stopped, reconnecting`
        );
        this.channel = undefined;
        this.scheduleReconnect();
      });

      channel.addListener("onMessage", (msg) => {
        if (this.channel !== channel) {
          return;
        }
        this.handleMessage(msg);
      });

      channel.start();
      this.lastDataReceived = Date.now();
      console.log("Listening on CAN interface", this.interfaceName);
    } catch (ex) {
      console.error(`Unable to open CAN interface ${this.interfaceName}: ${ex}`);
      this.channel = undefined;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimeout != null) {
      return;
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connect();
    }, RECONNECT_DELAY);
  }

  private handleMessage(msg: {
    id: number;
    ext?: boolean;
    rtr?: boolean;
    data: Buffer;
  }) {
    // NMEA 2000 uses 29-bit extended data frames exclusively. A standard or
    // remote frame carries an id parseCanId would happily turn into a bogus
    // PGN. Only skip when the flags say so, so that a binding which does not
    // report them keeps behaving as before.
    if (msg.ext === false || msg.rtr === true) {
      return;
    }

    this.lastDataReceived = Date.now();

    if (this.logStream != null) {
      this.logStream.write(
        `(${(Date.now() / 1000).toFixed(6)}) ${this.interfaceName} ${canIdString(
          msg.id
        )}#${msg.data.toString("hex").toUpperCase()}\n`
      );
    }

    const pgn = parseCanId(msg.id);
    if (pgn == null) {
      return;
    }
    pgn.timestamp = new Date().toISOString();

    // PGN 130824 "B&G: key-value data": canboatjs does not decode its dynamic
    // key/value list yet, so decode it ourselves and emit the scaled values,
    // tagged by source (different B&G devices send different key subsets).
    if (pgn.pgn === 130824) {
      const fields = decodeBandGKeyValue(pgn.src, msg.data);
      if (fields != null && this.onPoint != null) {
        this.onPoint({
          measurement: this.measurement,
          timestamp: new Date(),
          tags: { pgn: "130824", source: String(pgn.src) },
          fields,
        });
      }
    }

    // Returns undefined for the intermediate frames of a fast packet, and the
    // assembled message once the last frame arrives.
    const chunk = this.parser.parse({
      pgn,
      length: msg.data.length,
      data: msg.data,
    });
    if (chunk) {
      const p = chunkToRawPoint(chunk, this.measurement);

      if (this.onPoint != null && p != null) {
        this.onPoint(p);
      }
    }
  }

  private stopChannel() {
    const channel = this.channel;
    this.channel = undefined;
    try {
      channel?.stop();
    } catch (ex) {}
  }

  public close() {
    this.closed = true;
    if (this.noDataInterval != null) {
      clearInterval(this.noDataInterval);
      this.noDataInterval = undefined;
    }
    if (this.reconnectTimeout != null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    this.stopChannel();
    (this.logStream as any)?.end();
  }
}
