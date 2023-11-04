import { flatMap } from "lodash";
import WebSocket from "ws";
import { RawPoint } from "./types";
import he from "he";

export class H5000Input {
  private websocket: WebSocket;

  private groupByDataId: Map<number, { name: string; id: number }> = new Map();

  private dataById: Map<number, any> = new Map();

  public onPoint: ((point: RawPoint) => void) | undefined;

  public constructor({
    url,
    measurement = "h5000",
  }: {
    url: string;
    measurement?: string;
  }) {
    this.websocket = new WebSocket(url);

    this.websocket.on("error", console.error);

    this.websocket.on("open", () => {
      console.log("Connected to H5000 websocket");
      this.websocket.send(JSON.stringify({ DataListReq: { group: 40 } }));
    });

    this.websocket.on("message", (data) => {
      const msg = JSON.parse(data.toString("utf-8"));
      //   console.log(msg);

      if (msg.Data != null) {
        msg.Data.forEach((point) => {
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
            measurement,
            timestamp: new Date(),
            tags: {
              instance: instance?.str ?? data.inst?.toString(),
            },
            fields: {
              [name]: point.val,
            },
          });
        });
      } else if (msg.DataList != null) {
        const group = GROUPS.get(msg.DataList.groupId);
        if (group != null) {
          msg.DataList.list.forEach((id) => {
            this.groupByDataId.set(id, group);
          });
        }

        this.websocket.send(JSON.stringify({ DataInfoReq: msg.DataList.list }));
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

        this.websocket.send(
          JSON.stringify({
            DataReq: flatMap(msg.DataInfo, (info) =>
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
            ),
          })
        );
      }
    });

    // setTimeout(() => {
    //   console.log(
    //     JSON.stringify(fromPairs(Array.from(this.dataById)), null, 2)
    //   );
    // }, 1000);
  }

  public close() {
    this.websocket.close();
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
