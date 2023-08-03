import { entries, size } from "lodash";
import { Writable } from "stream";
import pgns from "@canboat/pgns";
import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";

const PGNS = pgns.PGNs.reduce((acc, pgn) => {
  acc[pgn.PGN] = {
    ...pgn,
    NamedFields: (pgn.Fields as Array<{ Name: string }>)?.reduce(
      (acc, field) => {
        acc[field.Name] = field;
        return acc;
      },
      {}
    ),
  };
  return acc;
}, {});

class InfluxApiOut extends Writable {
  private writeApi: WriteApi;

  constructor(url = "https://127.0.0.1:8096", token) {
    super({
      objectMode: true,
    });

    this.writeApi = new InfluxDB({ url, token }).getWriteApi(
      "ovni",
      "8c80beb193abbcef",
      "ms",
      {
        batchSize: 5000,
        flushInterval: 100,
      }
    );
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    // console.log(chunk);

    const fields = {};
    const reference = chunk.fields?.Reference;
    for (let [key, value] of entries(chunk.fields)) {
      if (!(typeof value === "number" && !Number.isNaN(value))) {
        continue;
      }
      if (key === "SID" || key === "Reference") {
        continue;
      }

      let unit = PGNS[chunk.pgn]?.NamedFields[key]?.Units;

      if (unit === "rad") {
        value = value * (180 / Math.PI);
        unit = "deg";
      } else if (unit === "rad/s") {
        value = value * (180 / Math.PI);
        unit = "deg/s";
      } else if (unit === "m/s") {
        value = value * 1.9438444924574;
        unit = "kn";
      }

      let fieldName = [key, reference, unit]
        .filter((x) => x != null)
        .join(", ");

      //   console.log(fieldName, value);

      fields[fieldName] = value;
    }

    if (size(fields) > 0) {
      const p = new Point("nmea");
      p.timestamp(new Date(chunk.timestamp.valueOf()));
      p.tag("pgn", chunk.pgn);
      p.tag("source", chunk.src);
      p.fields = fields;

      this.writeApi.writePoint(p);
      if (process.env.VERBOSE) {
        console.log(p.toLineProtocol());
      }
    }
    callback();
  }
}

export default InfluxApiOut;
