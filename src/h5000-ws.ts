import EventEmitter from "events";
import { flatMap } from "lodash";
import WebSocket from "ws";
import { RawPoint } from "./types";
import he from "he";

// Send a "ping" if there was no message for 30 seconds
const NO_DATA_TIMEOUT = 30_000;

// After "ping", wait 5 seconds for a "pong" or any other message
const PONG_TIMEOUT = 5_000;

export class H5000Websocket extends EventEmitter {
  private url: string;

  private shouldBeConnected = true;

  private websocketPromise: Promise<WebSocket> | undefined;

  private numConnectionAttempts = 0;

  private websocket: WebSocket | undefined;

  private lastPong: Date | undefined;

  private noDataTimeout: NodeJS.Timeout | undefined;

  private pongTimeout: NodeJS.Timeout | undefined;

  protected groupByDataId: Map<number, { name: string; id: number }> =
    new Map();

  protected dataById: Map<number, any> = new Map();

  public constructor(url: string) {
    super();
    this.url = url;

    this.connect().catch(() => {});
  }

  private send(data: any) {
    if (this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.websocket.send(JSON.stringify(data));
  }

  public async connect() {
    this.shouldBeConnected = true;

    if (this.websocketPromise != null) {
      return this.websocketPromise;
    }

    this.websocketPromise = this.connectInternal();

    return this.websocketPromise;
  }

  private async connectInternal() {
    if (this.websocket != null) {
      return this.websocket;
    }

    const setNoDataTimeout = () => {
      if (this.pongTimeout != null) {
        clearTimeout(this.pongTimeout);
      }
      if (this.noDataTimeout != null) {
        clearTimeout(this.noDataTimeout);
      }
      this.noDataTimeout = setTimeout(() => {
        if (
          this.lastPong != null &&
          this.lastPong.valueOf() > Date.now() - NO_DATA_TIMEOUT / 2
        ) {
          // Ok, data received since timeout was set
          return;
        }

        console.log("H5000 no data timeout elapsed, sending ping");
        if (this.pongTimeout != null) {
          clearTimeout(this.pongTimeout);
        }
        this.pongTimeout = setTimeout(() => {
          if (
            this.lastPong != null &&
            this.lastPong.valueOf() > Date.now() - PONG_TIMEOUT
          ) {
            // Ok, data received since timeout was set
            return;
          }

          console.log(
            "H5000 pong timeout elapsed, closing/reconnecting websocket"
          );
          this.websocket?.close();
        }, PONG_TIMEOUT);

        // Send ping (two ways) - H5000 does not seem to respond to ws pings
        // but we'll try anyway. The SettingListReq request should also trigger
        // a response from the server.
        this.websocket?.ping();
        this.send({ SettingListReq: [{ groupId: 2 }] });
      }, NO_DATA_TIMEOUT);
    };

    return new Promise<WebSocket>((resolve, reject) => {
      this.numConnectionAttempts += 1;

      this.websocket = new WebSocket(this.url, undefined, {
        handshakeTimeout: 5_000,
      });

      this.websocket.on("open", () => {
        console.log("H5000 websocket connected");
        this.numConnectionAttempts = 0;
        resolve(this.websocket);

        this.emit("open");

        setNoDataTimeout();
      });

      this.websocket.on("message", (data) => {
        this.lastPong = new Date();
        setNoDataTimeout();

        const msg = JSON.parse(data.toString("utf-8"));

        if (msg.Data != null) {
          this.emit("data", msg.Data);
        } else if (msg.DataList != null) {
          const group = GROUPS.get(msg.DataList.groupId);
          if (group != null) {
            msg.DataList.list.forEach((id) => {
              this.groupByDataId.set(id, group);
            });
          }

          this.send({ DataInfoReq: msg.DataList.list });
        } else if (msg.DataInfo != null) {
          msg.DataInfo.forEach((info) => {
            const group = this.groupByDataId.get(info.id);
            this.dataById.set(info.id, {
              ...info,
              instanceInfoById:
                info.instanceInfo != null
                  ? new Map(info.instanceInfo.map((i) => [i.inst, i]))
                  : undefined,
              group,
            });
          });

          this.dataReq(
            flatMap(msg.DataInfo, (info) =>
              info.instanceInfo != null
                ? info.instanceInfo.map((instance) => ({
                    id: info.id,
                    repeat: true,
                    inst: instance.inst,
                  }))
                : [
                    {
                      id: info.id,
                      repeat: true,
                    },
                  ]
            )
          );
        }
      });

      this.websocket.on("pong", () => {
        this.lastPong = new Date();
      });

      this.websocket.on("error", (e) => {
        console.error("H5000 connection error", e.message);
        this.websocket = undefined;
        this.websocketPromise = undefined;
        reject(e);
      });

      this.websocket.on("close", (code, msg) => {
        this.websocket = undefined;
        this.websocketPromise = undefined;
        if (this.noDataTimeout != null) {
          clearTimeout(this.noDataTimeout);
        }
        this.noDataTimeout = undefined;
        if (this.pongTimeout != null) {
          clearTimeout(this.pongTimeout);
        }
        this.pongTimeout = undefined;
        this.triggerReconnect();
      });
    });
  }

  public close() {
    this.shouldBeConnected = false;
    this.websocket.close();
    this.websocket = undefined;
    this.websocketPromise = undefined;
    this.numConnectionAttempts = 0;
  }

  private triggerReconnect() {
    if (!this.shouldBeConnected) {
      return;
    }

    const delay = Math.min(60, 2 ** Math.max(1, this.numConnectionAttempts));
    console.log(`H5000 reconnecting in ${delay} sec...`);

    setTimeout(() => {
      this.connect().catch(() => undefined);
    }, delay * 1000);
  }

  public allDataReq() {
    this.send({ DataListReq: { group: 40 } });
  }

  public dataReq(data) {
    this.send({
      DataReq: data,
    });
  }

  public sendData(data) {
    this.send({
      Data: data,
    });
  }
}

const GROUPS = new Map(
  [
    ["GPS", 1],
    ["Navigation", 2],
    ["Vessel", 3],
    ["Sonar", 4],
    ["Weather", 5],
    ["Trip", 6],
    ["Time", 7],
    ["Engine", 8],
    ["Transmission", 9],
    ["Fuel Tank", 10],
    ["Fresh Water Tank", 11],
    ["Gray Water Tank", 12],
    ["Live Well Tank", 13],
    ["Oil Tank", 14],
    ["Black Water Tank", 15],
    ["Engine Room", 16],
    ["Cabin", 17],
    ["Bait Well", 18],
    ["Refrigerator", 19],
    ["Heating System", 20],
    ["Freezer", 21],
    ["Battery", 22],
    ["Rudder", 23],
    ["Trim Tab", 24],
    ["AC Input", 25],
    ["Digital Switching", 26],
    ["Other", 27],
    ["GPS Status", 28],
    ["Route Data", 29],
    ["Speed Depth", 30],
    ["Log Timer", 31],
    ["Environment", 32],
    ["Wind", 33],
    ["Pilot", 34],
    ["Sailing", 35],
    ["AC Output", 36],
    ["Charger", 37],
    ["Inverter", 38],
    ["AllData", 40],
  ].map(
    ([name, id]) => [id, { id, name }] as [number, { id: number; name: string }]
  )
);
