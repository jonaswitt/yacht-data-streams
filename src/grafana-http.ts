import stream from "stream";
import fetch from "node-fetch";

class GrafanaHTTP extends stream.Writable {
  private url: string;
  private token: string;
  private metrics: string[];

  constructor(options: { url: string; token: string; metrics: string[] }) {
    super({
      objectMode: true,
    });
    this.url = options.url;
    this.token = options.token;
    this.metrics = options.metrics;
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    (async () => {
      const msg = `boatdata ${Object.getOwnPropertyNames(chunk.records)
        // this.metrics
        .map((key) => `${key}=${chunk.records[key] ?? 0}`)
        .join(",")} ${
        (chunk.timestampGps ?? chunk.timestamp).valueOf() * 1000000
      }`;
      console.log(msg);

      const res = await fetch(this.url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        method: "POST",
        body: msg,
      });

      const body = await res.text();

      callback(
        res.status === 200
          ? undefined
          : new Error(`Request failed with status ${res.status}`)
      );
    })();
  }
}

export default GrafanaHTTP;
