import stream from "stream";
import { PGN } from "./types";

class CalcTime extends stream.Transform {
  private pendingMessages: PGN[] = [];
  private timeOffset: number | undefined;
  private lastTimeMs: number | undefined;
  private pgn: number;
  private src: number | undefined;

  constructor(pgn = 129029, src = undefined) {
    super({ objectMode: true });
    this.pgn = pgn;
    this.src = src;
  }

  _transform(
    chunk: PGN,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    // console.log("2", JSON.stringify(chunk));

    const timeMs =
      chunk.time.length === 12 && chunk.time[2] == ":" && chunk.time[8] === "."
        ? Number(chunk.time.slice(0, 2)) * 3600 * 1000 +
          Number(chunk.time.slice(3, 5)) * 60 * 1000 +
          Number(chunk.time.slice(6, 8)) * 1000 +
          Number(chunk.time.slice(9, 12))
        : new Date(chunk.timestamp).valueOf();

    if (this.lastTimeMs != null && timeMs < this.lastTimeMs) {
      this.timeOffset = undefined;
    }
    this.lastTimeMs = timeMs;

    var chunkMs = {
      ...chunk,
      timeMs,
    };

    if (
      chunk.pgn === this.pgn &&
      (chunk.src === this.src || this.src == null)
    ) {
      const gpsTime = new Date(
        `${(chunk.fields["Date"] as string).replace(/\./g, "-")}T${(
          chunk.fields["Time"] as string
        ).slice(0, 12)}Z`
      ).valueOf();
      this.timeOffset = gpsTime - timeMs;

      for (const pending of this.pendingMessages) {
        this.pushPending(pending);
      }
      this.pendingMessages = [];
    }

    if (this.timeOffset == null) {
      this.pendingMessages.push(chunkMs);
    } else {
      this.pushPending(chunkMs);
    }

    callback();
  }

  protected pushPending(pendingMessage) {
    this.push({
      ...pendingMessage,
      timestamp: new Date(pendingMessage.timestamp),
      timestampGps:
        this.timeOffset != null
          ? new Date(pendingMessage.timeMs + this.timeOffset)
          : undefined,
    });
  }

  _flush(callback: stream.TransformCallback): void {
    console.log("time flush");
    if (this.timeOffset == null) {
      console.log("Warning: did not find time");
    }
    for (const pending of this.pendingMessages) {
      this.pushPending(pending);
    }
    callback();
  }
}

export default CalcTime;
