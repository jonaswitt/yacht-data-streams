import { InfluxDB, WriteApi } from "@influxdata/influxdb-client";
import { RawPoint, rawPointToInflux } from "./types";

export class InfluxOutput {
  private writeApi: WriteApi;

  constructor({
    url = "https://127.0.0.1:8096",
    token,
    org,
    bucket,
  }: {
    url?: string;
    token: string;
    org: string;
    bucket: string;
  }) {
    this.writeApi = new InfluxDB({ url, token }).getWriteApi(
      org,
      bucket,
      "ms",
      {
        batchSize: 5000,
        flushInterval: 100,
      }
    );
  }

  write(point: RawPoint) {
    this.writeApi.writePoint(rawPointToInflux(point));
  }
}
