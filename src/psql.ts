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
      console.log("PSQL", q);
      await this.client.query(q);
      console.log("  q done");

      callback();
    })();
  }

  _destroy(
    error: Error | null,
    callback: (error?: Error | null | undefined) => void
  ): void {
    console.log("done");

    callback();
  }

  _final(callback: (error?: Error | null | undefined) => void): void {
    // this.client.
    // disconnect?
    console.log("done");
    callback();
  }
}

export default PsqlInserter;
