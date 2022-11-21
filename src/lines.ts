import stream from "stream";

/** Breaks incoming byte stream into lines, separated by \n or \r\n */
class BreakLines extends stream.Transform {
  protected _invalidLine: string | undefined;

  constructor() {
    super({
      objectMode: true,
      encoding: "ascii",
    });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    var strData: string = chunk.toString("ascii");
    if (this._invalidLine) {
      strData = this._invalidLine + strData;
    }

    var objLines = strData.split("\n");
    for (let i = 0; i < objLines.length; i += 1) {
      var line = objLines[i];
      if (line.endsWith("\r")) {
        line = line.slice(0, line.length - 1);
      }
      if (i < objLines.length - 1) {
        this.push(line, "ascii");
      } else {
        this._invalidLine = line;
      }
    }

    callback();
  }

  _flush(callback: stream.TransformCallback): void {
    if (this._invalidLine) {
      this.push(this._invalidLine);
    }

    this._invalidLine = undefined;
    callback();
  }
}

export default BreakLines;
