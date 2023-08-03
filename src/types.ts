import { Point } from "@influxdata/influxdb-client";

export type PGN = {
  canId: number;
  prio: number;
  src: number;
  dst: number;
  pgn: number;
  time: string; // "00:00:00.010";
  input: string[];
  fields: Record<string, string | number>;
  description: string;
  timestamp: string; // "2022-11-19T17:46:54.400Z";
};

export type RawPoint = {
  measurement: string;
  timestamp: Date;
  tags?: Record<string, string>;
  fields: Record<string, string | number>;
};

export type Input = {
  onPoint?: (point: RawPoint) => void;
  close?: () => void;
};

export type PointProcessor = {
  process: (points: RawPoint[]) => RawPoint[];
};

export type Output = {
  write: (point: RawPoint) => void;
  close?: () => void;
};

export const rawPointToInflux = (p: RawPoint) => {
  const influxPoint = new Point(p.measurement).timestamp(p.timestamp);
  if (p.tags != null) {
    for (const [k, v] of Object.entries(p.tags)) {
      influxPoint.tag(k, v);
    }
  }
  for (const [k, v] of Object.entries(p.fields)) {
    if (typeof v === "number") {
      influxPoint.floatField(k, v);
    } else if (typeof v === "string") {
      influxPoint.stringField(k, v);
    }
  }
  return influxPoint;
};
