import WebSocket, { Server } from "ws";
import { RawPoint } from "./types";
import { fromPairs, toPairs } from "lodash";

export class WebsocketServer {
  private port: number;

  private subscriptions: WebSocket[] = [];

  constructor({ port }: { port: number }) {
    this.port = port;

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
    });
  }

  write(point: RawPoint) {
    const jsonMsg = JSON.stringify({
      timestamp: point.timestamp,
      records: point.tags?.instance
        ? fromPairs(
            toPairs(point.fields).map(([key, value]) => [
              `${key}_${point.tags.instance}`,
              value,
            ])
          )
        : point.fields,
    });
    this.subscriptions.forEach((ws) => {
      ws.send(jsonMsg);
    });
  }
}
