import stream from "stream";

class ConsoleJsonWriter extends stream.Writable {
  constructor() {
    super({
      objectMode: true,
    });
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    console.log(
      new Date(chunk.timestampGps ?? chunk.timestamp).toISOString(),
      Object.getOwnPropertyNames(chunk.records)
        .map((k) => `${k}=${chunk.records[k]}`)
        .join(" ")
    );
    callback();
  }
}

export default ConsoleJsonWriter;
