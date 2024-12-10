import { CortexChannel, CortexWebsocket } from "./cortex-ws";
import { RawPoint } from "./types";

export class CortexInput extends CortexWebsocket {
  private measurement: string;

  public onPoint: ((point: RawPoint) => void) | undefined;

  public constructor({
    host,
    measurement = "cortex",
  }: {
    host: string;
    measurement?: string;
  }) {
    super(host, [
      "VesselPositionUnderway",
      "InternalHeading",
      "BarometricPressure",
    ]);
    this.measurement = measurement;

    this.on("message", (type: CortexChannel, payload) => {
      switch (type) {
        case "VesselPositionUnderway":
          const lat = payload.a / 10_000_000;
          const lon = payload.o / 10_000_000;
          const timestamp = new Date(payload.t * 1000);

          this.onPoint?.({
            measurement: this.measurement,
            timestamp,
            fields: {
              "GPS Latitude": lat,
              "GPS Longitude": lon,
              COG: payload.cog,
              SOG: payload.sog,
            },
          });
          break;

        case "InternalHeading":
          this.onPoint?.({
            measurement: this.measurement,
            fields: {
              Heading: payload.heading,
            },
          });
          break;

        case "BarometricPressure":
          if (
            payload.internalPressure != null &&
            !Number.isNaN(payload.internalPressure)
          ) {
            this.onPoint?.({
              measurement: this.measurement,
              fields: {
                "Barometric Pressure": payload.internalPressure / 100,
              },
            });
          }
          break;
      }
    });
  }
}
