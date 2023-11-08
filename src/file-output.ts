import { InfluxDB, WriteApi } from "@influxdata/influxdb-client";
import { RawPoint, rawPointToInflux } from "./types";
import * as FileStreamRotator from "file-stream-rotator";

export class FileOutput {
  private logStream: ReturnType<(typeof FileStreamRotator)["getStream"]>;

  constructor(options: Parameters<(typeof FileStreamRotator)["getStream"]>[0]) {
    this.logStream = FileStreamRotator.getStream(options);
  }

  write(point: RawPoint) {
    this.logStream.write(rawPointToInflux(point).toLineProtocol() + "\n");
  }
}
