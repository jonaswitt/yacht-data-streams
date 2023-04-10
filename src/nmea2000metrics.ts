import stream from "stream";

class NMEA2000Metrics extends stream.Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    const records = {};

    switch (chunk.pgn) {
      case 129029:
        records["Lat"] = chunk.fields.Latitude;
        records["Lon"] = chunk.fields.Longitude;
        break;

      case 127250:
        switch (chunk.fields.Reference) {
          case "Magnetic":
            records["Heading_Mag"] = chunk.fields.Heading * (180 / Math.PI);
            break;
        }
        break;

      case 130306:
        switch (chunk.fields.Reference) {
          case "Apparent":
            records["AWS"] = chunk.fields["Wind Speed"] * (3600.0 / 1852.0);
            records["AWA"] = chunk.fields["Wind Angle"] * (180 / Math.PI);
            break;

          case "True (boat referenced)":
            records["TWS"] = chunk.fields["Wind Speed"] * (3600.0 / 1852.0);
            records["TWA"] = chunk.fields["Wind Angle"] * (180 / Math.PI);
            break;

          case "True (ground referenced to North)":
            records["TWS"] = chunk.fields["Wind Speed"] * (3600.0 / 1852.0);
            records["TWD"] = chunk.fields["Wind Angle"] * (180 / Math.PI);
            break;
        }
        break;

      case 129025:
        records["Lat"] = chunk.fields.Latitude;
        records["Lon"] = chunk.fields.Longitude;
        break;

      case 127257:
        records["Trim"] = chunk.fields.Pitch * (180 / Math.PI);
        records["Heel"] = chunk.fields.Roll * (180 / Math.PI);
        break;

      case 127245:
        records["Rudder"] = chunk.fields.Position * (180 / Math.PI);
        break;

      case 127251:
        records["ROT"] = chunk.fields.Rate * (180 / Math.PI);
        break;

      case 128259:
        records["BoatSpeed"] =
          chunk.fields["Speed Water Referenced"] * (3600.0 / 1852.0);
        break;

      case 65293:
        break;
    }

    if (Object.getOwnPropertyNames(records).length > 0) {
      this.push({
        ...chunk,
        records,
      });
    }

    callback();
  }
}

export default NMEA2000Metrics;
