import pgns from "@canboat/pgns";
import { entries, size } from "lodash";
import { RawPoint } from "./types";

const PGNS = pgns.PGNs.reduce((acc, pgn) => {
  acc[pgn.PGN] = {
    ...pgn,
    NamedFields: (pgn.Fields as Array<{ Name: string }>)?.reduce(
      (acc, field) => {
        acc[field.Name] = field;
        return acc;
      },
      {}
    ),
  };
  return acc;
}, {});

// Converts a decoded canboatjs chunk ({ pgn, src, fields }) into a RawPoint.
// Shared by the ydgw (UDP) and can (socketcan) inputs so both transports emit
// identical points. Returns undefined if nothing survived the field filter.
export const chunkToRawPoint = (
  chunk: any,
  measurement: string
): RawPoint | undefined => {
  const p: RawPoint = {
    measurement,
    tags: {
      pgn: chunk.pgn.toString(),
      source: chunk.src.toString(),
    },
    fields: {},
  };

  const reference = chunk.fields?.Reference;
  for (let [key, value] of entries(chunk.fields)) {
    if (!(typeof value === "number" && !Number.isNaN(value))) {
      continue;
    }
    if (key === "SID" || key === "Reference") {
      continue;
    }

    let unit = PGNS[chunk.pgn]?.NamedFields[key]?.Units;

    if (unit === "rad") {
      value = value * (180 / Math.PI);
      unit = "deg";
    } else if (unit === "rad/s") {
      value = value * (180 / Math.PI);
      unit = "deg/s";
    } else if (unit === "m/s") {
      value = value * 1.9438444924574;
      unit = "kn";
    }

    let fieldName = [key, reference, unit].filter((x) => x != null).join(", ");

    if (typeof value === "number" && !Number.isNaN(value)) {
      p.fields[fieldName] = value;
    } else if (typeof value === "string") {
      p.fields[fieldName] = value;
    }
  }

  if (size(p.fields) === 0) {
    return undefined;
  }

  return p;
};
