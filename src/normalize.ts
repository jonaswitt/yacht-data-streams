import { mapValues } from "lodash";
import stream from "stream";

/**
 * modulo function using floored division unlike Javascript's "%" operator
 * which uses a truncated division implementation.
 * See https://en.wikipedia.org/wiki/Modulo_operation#Variants_of_the_definition
 */
const modFloor = (a: number, n: number) => a - n * Math.floor(a / n);

/**
 * Normalizes an angle between 0..359.99 degrees
 */
const normalizeAbsoluteAngle = (angle: number) => modFloor(angle, 360);

/**
 * Normalizes an angle between -180..179.99 degrees
 */
const normalizeRelativeAngle = (angle: number) =>
  modFloor(angle + 180, 360) - 180;

function normalizeValue(metric: string, value: number | undefined | null) {
  if (value == null) {
    return value;
  }
  switch (metric) {
    case "Lat":
    case "Lon":
    case "TWA":
    case "AWA":
    case "Heel":
    case "Trim":
      return normalizeRelativeAngle(value);

    case "Heading":
    case "Heading_Mag":
    case "TWD":
      return normalizeAbsoluteAngle(value);

    default:
      return value;
  }
}

class Normalize extends stream.Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    this.push({
      ...chunk,
      records:
        chunk.records != null
          ? mapValues(chunk.records, (value, metric) =>
              normalizeValue(metric, value)
            )
          : undefined,
    });
    callback();
  }
}

export default Normalize;
