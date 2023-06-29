import fs from "fs";
import Sort from "./src/sort";
import AverageWindow from "./src/average";
import CalcTime from "./src/calctime";
import NMEA2000Metrics from "./src/nmea2000metrics";
import PsqlInserter from "./src/psql";
import ParseYDGW from "./src/ydgw";
import CSVRows from "./src/csv";
import { format } from "@fast-csv/format";
import Normalize from "./src/normalize";
import GrafanaWS from "./src/grafana-ws";
import GrafanaHTTP from "./src/grafana-http";
import { Readable, pipeline, PassThrough } from "stream";
import UDPIn from "./src/udp-in";

process.stdout.on("error", (err) => {
  if (err.code == "EPIPE") {
    process.exit(0);
  }
});

const canboatObjects = pipeline(
  new UDPIn(9000),
  //   new PassThrough({ objectMode: true }).on("data", (data) => console.log(data)),

  new ParseYDGW(),
  //   new PassThrough({ objectMode: true }).on("data", (data) => console.log(data)),

  new CalcTime(129033),
  //   new RealtimePlayback({
  //     // resetTime: true,
  //   }),

  new NMEA2000Metrics(),
  new Normalize(),
  // Debugging
  // new PassThrough({ objectMode: true }).on("data", (data) => console.log(data)),

  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }
) as unknown as Readable;

const avg1Sec = pipeline(
  canboatObjects,
  new Sort(1000),
  new AverageWindow(1000),
  new Normalize(),

  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }
);

// CSV

pipeline(
  avg1Sec,
  new CSVRows(["Lat", "Lon", "Heading_Mag", "AWA", "AWS"]),
  format(),
  fs.createWriteStream("out-1sec.csv"),
  (err) => {
    if (err != null) {
      console.warn(err);
    }
  }
);

const avg10Sec = pipeline(
  avg1Sec,
  new AverageWindow(10000),
  new Normalize(),
  (err) => {
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }
);

pipeline(
  avg10Sec,
  new CSVRows(["Lat", "Lon", "Heading_Mag", "AWA", "AWS"]),
  format(),
  fs.createWriteStream("out-10sec.csv"),
  (err) => {
    if (err != null) {
      console.warn(err);
    }
  }
);

// PSQL
if (process.env["PGUSER"]) {
  pipeline(canboatObjects, new PsqlInserter(), (err) => {
    if (err != null) {
      console.warn(err);
    }
  });
}

// Grafana
if (process.env["GRAFANA_TOKEN"]) {
  pipeline(
    canboatObjects,
    new Sort(500),
    new AverageWindow(500),
    new Normalize(),
    new GrafanaHTTP({
      url: "http://localhost:3000/api/live/push/canboat",
      token: process.env["GRAFANA_TOKEN"],
      metrics: ["AWS"],
    }),
    //   new GrafanaWS({
    //     url: "ws://localhost:3000/api/live/push/canboat",
    //     token: process.env["GRAFANA_TOKEN"],
    //   })
    (err) => {
      if (err != null) {
        console.warn(err);
      }
    }
  );
}
