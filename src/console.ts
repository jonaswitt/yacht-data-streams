import stream from "stream";
import { RawPoint, rawPointToInflux } from "./types";

class ConsoleJsonWriter {
  constructor(opts: any) {}

  write(point: RawPoint) {
    console.log(rawPointToInflux(point).toLineProtocol());
  }
}

export default ConsoleJsonWriter;
