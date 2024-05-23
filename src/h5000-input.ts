import { flatMap } from "lodash";
import WebSocket from "ws";
import { RawPoint } from "./types";
import he from "he";
import { H5000Websocket } from "./h5000-ws";

// Send a "ping" if there was no message for 30 seconds
const NO_DATA_TIMEOUT = 30_000;

// After "ping", wait 5 seconds for a "pong" or any other message
const PONG_TIMEOUT = 5_000;

export class H5000Input extends H5000Websocket {
  private measurement: string;

  public onPoint: ((point: RawPoint) => void) | undefined;

  public constructor({
    url,
    measurement = "h5000",
  }: {
    url: string;
    measurement?: string;
  }) {
    super(url);
    this.measurement = measurement;

    this.on("open", () => {
      this.allDataReq();
    });

    this.on("data", (dataMsg) => {
      dataMsg.forEach((point) => {
        const data = this.dataById.get(point.id);
        if (data == null || !point.valid) {
          return;
        }

        const instance = data.instanceInfoById?.get(point.inst);
        //   const influxPoint = new Point(measurement).timestamp(new Date());
        //   influxPoint.tag("instance", instance?.str ?? data.inst.toString());
        //   influxPoint.floatField(`${data.group.name}/${data.sname}`, point.val);

        let name = he.decode(data.lname);
        if (data.unit?.length) {
          name += `, ${he.decode(data.unit).replace("°", "deg")}`;
        }

        this.onPoint?.({
          measurement: this.measurement,
          timestamp: new Date(),
          tags: {
            instance: instance?.str ?? data.inst?.toString(),
          },
          fields: {
            [name]: point.val,
          },
        });
      });
    });
  }
}
