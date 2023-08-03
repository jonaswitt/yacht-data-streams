import WebSocket from "ws";
import { RawPoint, rawPointToInflux } from "./types";

class GrafanaWS {
  private websocket: WebSocket;
  private openPromise: Promise<unknown> | undefined;

  constructor(options: { url: string; token: string }) {
    this.websocket = new WebSocket(options.url, {
      headers: {
        Authorization: `Bearer ${options.token}`,
        // Origin: "http://localhost:3000",
      },
    });

    this.openPromise = new Promise((resolve) => {
      this.websocket.on("open", () => {
        console.log("Grafana live WS open");
        resolve(undefined);
      });
      //   this.websocket.on("error", (err) => {
      //     console.warn(err);
      //   });
    });
  }

  async write(point: RawPoint) {
    if (this.openPromise != null) {
      await this.openPromise;
      this.openPromise = undefined;
    }

    const msg = rawPointToInflux(point).toLineProtocol();
    if (msg != null) {
      this.websocket.send(msg, (err) => {
        if (err != null) {
          console.warn(err);
        }
      });
    }
  }
}

export default GrafanaWS;
