import stream from "stream";
import { Parser } from "@canboat/canboatjs/lib/fromPgn";

class ParseYDGW extends stream.Transform {
  protected parser: Parser;

  constructor() {
    super({ objectMode: true });

    this.parser = new Parser();
    this.parser.on("error", (pgn, error) => {
      console.error(`Error parsing ${pgn.pgn} ${error}`);
      console.error(error.stack);
    });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    const res = this.parser.parseYDGW02(chunk.trim());
    if (res) {
      this.push(res);
    }
    callback();
  }
}

export default ParseYDGW;
