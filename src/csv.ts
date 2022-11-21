import stream from "stream";

function decimalsForMetric(metric: string) {
  switch (metric) {
    case "Lat":
    case "Lon":
      return 6;

    default:
      return 1;
  }
}

class CSVRows extends stream.PassThrough {
  private pushedHeader = false;
  private metrics: string[];

  constructor(metrics: string[]) {
    super({
      objectMode: true,
    });
    this.metrics = metrics;
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    if (!this.pushedHeader) {
      this.push(["SecondsSince1970", "ISODateTimeUTC", ...this.metrics]);
      this.pushedHeader = true;
    }
    const ts = new Date(chunk.timestampGps ?? chunk.timestamp);
    this.push([
      (ts.valueOf() / 1000).toFixed(3),
      ts.toISOString(),
      ...this.metrics.map(
        (metric) =>
          chunk.records[metric]?.toFixed(decimalsForMetric(metric)) ?? ""
      ),
    ]);
    callback();
  }
}

export default CSVRows;
