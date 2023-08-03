import dgram from "dgram";
import { entries, size } from "lodash";
import { Writable } from "stream";
import pgns from "@canboat/pgns";

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

const mapping = {
  // "Speed Water Referenced, kn": "BoatSpeed",
  // "Wind Angle, True (ground referenced to North), deg": "TWD",
  // "Wind Speed, True (ground referenced to North), kn": "TWS",
  // "Wind Angle, True (boat referenced), deg": "TWA",
  // "Wind Angle, Apparent, deg": "AWA",
  // "Wind Speed, Apparent, kn": "AWS",
  // "Latitude, deg": "Lat",
  // "Longitude, deg": "Lon",
  // "Heading, Magnetic, deg": "Heading_Mag",
  // "COG, deg": "COG",
  // "SOG, kn": "SOG",
  // "Pitch, deg": "Trim",
  // "Roll, deg": "Heel",
};

const escapeKey = (key: string) => key.replace(/[,= ]/g, (m) => `\\${m}`);
const escapeValue = (value: string) => JSON.stringify(value);

class InfluxOut extends Writable {
  private address: string;
  private port: number;
  private socket: dgram.Socket;

  constructor(address = "127.0.0.1", port = 8094) {
    super({
      objectMode: true,
    });
    this.address = address;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this.socket.unref();
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
      const lines: string[] = [
        `nmea,pgn=${chunk.pgn},source=${chunk.src} ${entries(fields)
          .map(([key, value]) => `${escapeKey(key)}=${value}`)
          .join(",")} ${(chunk.timestamp.valueOf() * 1000000).toFixed(0)}`,
      ];

      const mappedFields = entries(fields)
        .map(([key, value]) => [mapping[key], value])
        .filter(([key, value]) => key != null);
      if (mappedFields.length > 0) {
        lines.push(
          `flat ${mappedFields
            .map(([key, value]) => `${escapeKey(key)}=${value}`)
            .join(",")} ${(chunk.timestamp.valueOf() * 1000000).toFixed(0)}`
        );
      }

      this.socket.send(
        Buffer.from(lines.join("\r\n"), "ascii"),
        this.port,
        this.address,
        (err) => {
          callback(err);
        }
      );

      for (const line of lines) {
        console.log(line);
      }
    } else {
      callback();
    }
  }
}

export default InfluxOut;
