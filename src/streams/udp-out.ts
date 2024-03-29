import dgram from "dgram";
import { Writable } from "stream";

class UDPOut extends Writable {
  private address: string;
  private port: number;
  private socket: dgram.Socket;

  constructor(address = "127.0.0.1", port = 9000) {
    super({
      objectMode: true,
    });
    this.address = address;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this.socket.unref();
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    // console.log(chunk);
    if (Array.isArray(chunk.input)) {
      for (const line of chunk.input) {
        if (process.env.VERBOSE) {
          console.log(`UDP ${this.port} ${line}`);
        }
        this.socket.send(
          Buffer.from(line + "\r\n", "ascii"),
          this.port,
          this.address
        );
      }
    }
    callback();
  }
}

export default UDPOut;
