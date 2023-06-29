import { keys, map } from "lodash";
import stream from "stream";
import WebSocket from "ws";

class GrafanaWS extends stream.Writable {
  private websocket: WebSocket;
  private openPromise: Promise<unknown> | undefined;

  constructor(options: { url: string; token: string }) {
    super({
      objectMode: true,
    });

    this.websocket = new WebSocket(options.url, {
      headers: {
        // Authorization: `Bearer ${options.token}`,
        // Origin: "http://localhost:3000",
      },
    });

    this.openPromise = new Promise((resolve) => {
      this.websocket.on("open", () => {
        console.log("WS open");
        resolve(undefined);
      });
      //   this.websocket.on("error", (err) => {
      //     console.warn(err);
      //   });
    });
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    (async () => {
      if (this.openPromise != null) {
        await this.openPromise;
        this.openPromise = undefined;
      }

      const msg = `boatdata ${map(
        chunk.records,
        ([key, value]) => `${key}=${value}`
      ).join(",")}`;
      console.log("WS", msg);
      this.websocket.send(msg, (err) => {
        if (err != null) {
          console.warn(err);
        }
        callback(err);
      });
    })();
  }
}

export default GrafanaWS;
