import { flatMap } from "lodash";
import WebSocket from "ws";
import { RawPoint } from "./types";
import he from "he";
import { H5000Websocket } from "./h5000-ws";

// Send a "ping" if there was no message for 30 seconds
const NO_DATA_TIMEOUT = 30_000;

// After "ping", wait 5 seconds for a "pong" or any other message
const PONG_TIMEOUT = 5_000;

const EPOCH_VALUE = 2460649;
const EPOCH_DATE = new Date("2024-12-04T00:00:00.000Z");

export class H5000Input extends H5000Websocket {
  private measurement: string;

  public onPoint: ((point: RawPoint) => void) | undefined;

  public onDateTime: ((timestamp: Date) => void) | undefined;

  private utcDate: Date | undefined;

  private lastUtcTimeValue: number | undefined;

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

        switch (point.id) {
          case 34: // UTC Date
            this.utcDate = new Date(
              EPOCH_DATE.valueOf() +
                (point.sysVal - EPOCH_VALUE) * 24 * 60 * 60 * 1000
            );
            break;

          case 35: // UTC Time
            if (
              this.lastUtcTimeValue != null &&
              point.sysVal < this.lastUtcTimeValue
            ) {
              // date advanced
              this.utcDate = undefined;
            }
            this.lastUtcTimeValue = point.sysVal;
            if (this.utcDate == null) {
              break;
            }
            const utcDateTime = new Date(
              this.utcDate.valueOf() + point.sysVal * 1000
            );
            this.onDateTime(utcDateTime);
            break;
        }

        this.onPoint?.({
          measurement: this.measurement,
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
