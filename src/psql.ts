import stream from "stream";
import { Client } from "pg";

class PsqlInserter extends stream.Writable {
  private client: Client;
  private connectPromise: Promise<any> | undefined;

  constructor() {
    super({
      objectMode: true,
    });

    this.client = new Client();
    this.connectPromise = this.client.connect();
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    const recordKeys = Object.getOwnPropertyNames(chunk.records);
    const fields = ["time", recordKeys];

    const chunkTime = chunk.timestampGps || chunk.timestamp;
    let timeS = chunkTime.toISOString();

    const values = [`'${timeS}'`, ...recordKeys.map((k) => chunk.records[k])];

    (async () => {
      if (this.connectPromise != null) {
        await this.connectPromise;
      }
      this.connectPromise = undefined;

      const q = `INSERT INTO boatdata (${fields}) VALUES (${values});`;
      await this.client.query(q);

      callback();
    })();
  }
}

export default PsqlInserter;
