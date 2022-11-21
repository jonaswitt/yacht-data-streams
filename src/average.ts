import { flatMap, fromPairs, keys, mean, sum, uniq } from "lodash";
import stream from "stream";

/**
 * convert from degrees into radians
 *
 * @param deg - The degrees to be converted into radians
 * @return radians
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * convert from radians into degrees
 *
 * @param rad - The radians to be converted into degrees
 * @return degrees
 */
function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

const meanBearingFiltered = (nonNullValues: number[]): number | undefined => {
  if (nonNullValues.length === 0) {
    return undefined;
  }
  const rads = nonNullValues.map((v) => degToRad(v));
  const x = sum(rads.map((v) => Math.sin(v)));
  const y = sum(rads.map((v) => Math.cos(v)));
  return radToDeg(Math.atan2(x, y));
  /* c8 ignore next */
};

const meanBearing = (
  values: Array<number | null | undefined>
): number | undefined =>
  meanBearingFiltered(values.filter((v) => v != null) as number[]);

function averageFn(metric: string) {
  switch (metric) {
    case "Lat":
    case "Lon":
    case "COG":
    case "Heading":
    case "Heading_Mag":
    case "TWD":
      return meanBearing;
    default:
      return mean;
  }
}

class AverageWindow extends stream.Transform {
  private windowSizeMs: number;
  private chunks: any[] = [];
  private chunkTimeRoundCurrent: number | undefined;

  constructor(windowSizeMs: number) {
    super({
      objectMode: true,
    });
    this.windowSizeMs = windowSizeMs;
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    const chunkTime = chunk.timestampGps || chunk.timestamp;
    const chunkTimeRound =
      Math.ceil(chunkTime.valueOf() / this.windowSizeMs) * this.windowSizeMs;

    if (this.chunkTimeRoundCurrent == null) {
      this.chunkTimeRoundCurrent = chunkTimeRound;
      this.chunks.push(chunk);
    } else if (this.chunkTimeRoundCurrent === chunkTimeRound) {
      this.chunks.push(chunk);
    } else {
      this.pushChunks();
      this.chunkTimeRoundCurrent = chunkTimeRound;
      this.chunks.push(chunk);
    }

    callback();
  }

  _final(callback: (error?: Error | null | undefined) => void): void {
    this.pushChunks();
    callback();
  }

  pushChunks() {
    if (this.chunks.length === 0 || this.chunkTimeRoundCurrent == null) {
      return;
    }

    const values = fromPairs(
      uniq(flatMap(this.chunks, (c) => keys(c.records))).map((key) => [
        key,
        averageFn(key)(
          this.chunks
            .map((c) => c.records[key])
            .filter((value) => value != null && !Number.isNaN(value))
        ),
      ])
    );

    this.push({
      timestamp: new Date(this.chunkTimeRoundCurrent),
      records: values,
      chunkCount: this.chunks.length,
    });

    this.chunks = [];
  }
}

export default AverageWindow;
