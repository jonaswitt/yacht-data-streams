import stream from "stream";

class JsonlFormat extends stream.Transform {
  constructor() {
    super({
      objectMode: true,
    });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    this.push({
      r: chunk.records,
      t: new Date(chunk.timestampGps ?? chunk.timestamp).valueOf() / 1000,
    });
    callback();
  }
}

export default JsonlFormat;
