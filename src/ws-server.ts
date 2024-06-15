import WebSocket, { Server } from "ws";
import { RawPoint } from "./types";
import { fromPairs, toPairs } from "lodash";
import parseDuration from "parse-duration";

type ParsedPoint = {
  timestamp: Date;
  records: Record<string, string | number | undefined>;
};

export class WebsocketServer {
  private port: number;

  private historyMaxAge: number;

  private history: ParsedPoint[] = [];

  private subscriptions: WebSocket[] = [];

  constructor({
    port,
    historyMaxAge,
  }: {
    port: number;
    historyMaxAge?: string;
  }) {
    this.port = port;
    this.historyMaxAge =
      historyMaxAge != null ? parseDuration(historyMaxAge) : 0;

    const server = new Server({ port });

    server.on("listening", () => {
      console.log(`Websocket listening on ws://0.0.0.0:${this.port}`);
    });
    server.on("error", (e) => {
      console.warn("Websocket error", e.message);
    });
    server.on("close", (e) => {
      console.warn("Websocket closed");
    });

    server.on("connection", (ws, req) => {
      this.subscriptions.push(ws);

      ws.on("error", (e) => {
        console.warn("Websocket connection error", e.message);
      });

      ws.on("close", () => {
        this.subscriptions = this.subscriptions.filter((s) => s !== ws);
      });

      for (let i = this.history.length - 1; i >= 0; i -= 1) {
        ws.send(JSON.stringify(this.history[i]));
      }
    });
  }

  write(point: RawPoint) {
    const parsedPoint: ParsedPoint = {
      timestamp: point.timestamp,
      records: point.tags?.instance
        ? fromPairs(
            toPairs(point.fields).map(([key, value]) => [
              `${key}_${point.tags.instance}`,
              value,
            ])
          )
        : point.fields,
    };

    const jsonMsg = JSON.stringify(parsedPoint);
    this.subscriptions.forEach((ws) => {
      ws.send(jsonMsg);
    });

    if (this.historyMaxAge > 0) {
      const cutoff = new Date(Date.now() - this.historyMaxAge);
      if (
        this.history.length > 0 &&
        this.history[0].timestamp.valueOf() < cutoff.valueOf() - 60 * 1000
      ) {
        const idx = this.history.findIndex(
          (p) => p.timestamp.valueOf() > cutoff.valueOf()
        );
        if (idx > 0) {
          this.history = this.history.slice(idx);
        }
      }

      this.history.push(parsedPoint);
    }
  }
}
