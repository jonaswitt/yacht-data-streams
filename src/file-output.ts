import { mapKeys, mapValues } from "lodash";
import { RawPoint, rawPointToInflux } from "./types";
import * as FileStreamRotator from "file-stream-rotator";

export class FileOutput {
  private logStream: ReturnType<(typeof FileStreamRotator)["getStream"]>;

  private format: "jsonl" | "influx";

  private decimals: number | undefined;

  constructor({
    format,
    decimals,
    ...options
  }: Parameters<(typeof FileStreamRotator)["getStream"]>[0] & {
    format?: "jsonl" | "influx";
    decimals?: number;
  }) {
    this.logStream = FileStreamRotator.getStream(options);
    this.format = format ?? "influx";
    this.decimals = decimals;
  }

  write(point: RawPoint) {
    switch (this.format) {
      case "influx":
        this.logStream.write(rawPointToInflux(point).toLineProtocol() + "\n");
        break;
      case "jsonl":
        let records = point.fields;
        if (this.decimals != null) {
          records = mapValues(records, (value) =>
            typeof value === "number"
              ? Math.round(value * 10 ** this.decimals) / 10 ** this.decimals
              : value
          );
        }
        if (point.tags.instance != null) {
          records = mapKeys(
            records,
            (value, key) => `${key}_${point.tags.instance}`
          );
        }
        this.logStream.write(
          JSON.stringify({
            t: point.timestamp.valueOf() / 1000,
            r: records,
          }) + "\n"
        );
        break;
    }
  }
}
