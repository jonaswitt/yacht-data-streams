import { fromPairs, size, toPairs } from "lodash";
import { RawPoint, rawPointToInflux } from "./types";
import dgram from "dgram";

export class UdpNjordOutput {
  private address: string;
  private port: number;
  private socket: dgram.Socket;

  constructor({
    port,
    address,
    broadcast = true,
  }: {
    port: number;
    address?: string;
    broadcast?: boolean;
  }) {
    this.address = address;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    if (broadcast) {
      this.socket.bind(undefined, undefined, () => {
        this.socket.setBroadcast(true);
      });
    }
    this.socket.unref();
  }

  write(point: RawPoint) {
    const jsonLine = JSON.stringify({
      timestamp: point.timestamp,
      records: point.tags?.instance
        ? fromPairs(
            toPairs(point.fields).map(([key, value]) => [
              `${key}_${point.tags.instance}`,
              value,
            ])
          )
        : point.fields,
    });
    if (process.env.VERBOSE) {
      console.log(`UDP ${this.port} ${jsonLine}`);
    }
    this.socket.send(
      Buffer.from(jsonLine + "\r\n", "ascii"),
      this.port,
      this.address
    );
  }
}
