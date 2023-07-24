import dgram from "dgram";
import { Readable } from "stream";

class UDPIn extends Readable {
  private socket: dgram.Socket;

  constructor(port = 9000) {
    super({
      objectMode: true,
    });
    this.socket = dgram.createSocket("udp4");
    this.socket.on("message", (msg, info) => {
      this.push(msg.toString("ascii"), "ascii");
    });
    this.socket.bind(port);
    console.log("Listening on UDP port", port);
  }

  _read(size: number): void {}
}

export default UDPIn;
