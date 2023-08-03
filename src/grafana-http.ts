import fetch from "node-fetch";
import { RawPoint, rawPointToInflux } from "./types";

class GrafanaHTTP {
  private url: string;
  private token: string;

  constructor(options: { url: string; token: string }) {
    this.url = options.url;
    this.token = options.token;
  }

  async write(point: RawPoint) {
    const msg = rawPointToInflux(point).toLineProtocol();
    if (msg != null) {
      const res = await fetch(this.url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        method: "POST",
        body: msg,
      });

      // console.log(res.status, res.statusText, msg);
      if (!res.ok) {
        throw new Error(
          `Grafana HTTP write failed: ${res.status}: ${await res.text()}`
        );
      }
    }
  }
}

export default GrafanaHTTP;
