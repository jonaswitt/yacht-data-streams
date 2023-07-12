import dgram from "dgram";
import { entries, size } from "lodash";
import { Writable } from "stream";

class InfluxOut extends Writable {
  private address: string;
  private port: number;
  private socket: dgram.Socket;

  constructor(address = "127.0.0.1", port = 8094) {
    super({
      objectMode: true,
    });
    this.address = address;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    // console.log(chunk);

    const fields = {};
    const reference = chunk.fields?.Reference;
    for (const [key, value] of entries(chunk.fields)) {
      if (!(typeof value === "number" && !Number.isNaN(value))) {
        continue;
      }
      if (key === "SID" || key === "Reference") {
        continue;
      }
      const fieldName = reference != null ? `${key}, ${reference}` : key;
      fields[fieldName] = value;
    }

    if (size(fields) > 0) {
      const line = `nmea,pgn=${chunk.pgn},source=${chunk.src} ${entries(fields)
        .map(
          ([key, value]) => `${key.replace(/[,= ]/g, (m) => `\\${m}`)}=${value}`
        )
        .join(",")} ${(chunk.timestamp.valueOf() * 1000000).toFixed(0)}`;
      console.log(line);

      this.socket.send(
        Buffer.from(line + "\r\n", "ascii"),
        this.port,
        this.address
      );
    }

    callback();
  }
}

export default InfluxOut;
