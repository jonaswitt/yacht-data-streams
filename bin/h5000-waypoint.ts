#!/usr/bin/env node

import WebSocket from "ws";

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h") || argv.length < 3) {
  console.error(`Usage: h5000-waypoint [ws://host:port] [lat] [lon] 

Options:
  -h, --help       output usage information`);
  process.exit(1);
}

const url = argv[0];
const markLatitude = Number(argv[1]);
const markLongitude = Number(argv[2]);

const websocket = new WebSocket(url, {});

const send = (obj) => {
  // console.log(">>>", JSON.stringify(obj, undefined, 2));
  websocket.send(JSON.stringify(obj));
};

websocket.on("error", console.error);

let initialLat: number | undefined;
let initialLon: number | undefined;

let lastLat: number | undefined;
let lastLon: number | undefined;
let lastCog: number | undefined;
let lastSog: number | undefined;

websocket.on("open", async () => {
  console.log("Connected to H5000 websocket");

  send({
    DataReq: [
      { id: 9, repeat: true },
      { id: 41, repeat: true },
      { id: 421, repeat: true },
      { id: 422, repeat: true },
    ],
  });
});

websocket.on("message", (data) => {
  const msg = JSON.parse(data.toString("utf-8"));
  // console.log("<<<", JSON.stringify(msg, undefined, 2));

  if (msg.Data != null) {
    let latLonUpdated = false;
    for (const point of msg.Data) {
      switch (point.id) {
        case 9:
          lastCog = radToDeg(point.sysVal);
          break;
        case 41:
          lastSog = point.sysVal;
          break;
        case 421:
          lastLat = radToDeg(point.sysVal);
          if (initialLat == null) {
            initialLat = lastLat;
          }
          latLonUpdated = true;
          break;
        case 422:
          lastLon = radToDeg(point.sysVal);
          if (initialLon == null) {
            initialLon = lastLon;
          }
          latLonUpdated = true;
          break;
      }
    }
    if (
      latLonUpdated &&
      initialLat != null &&
      initialLon != null &&
      lastLat != null &&
      lastLon != null
    ) {
      const mkBearing = bearing(lastLat, lastLon, markLatitude, markLongitude);
      const mkRange = getDistance(
        lastLat,
        lastLon,
        markLatitude,
        markLongitude
      );

      const mkXte = xte(
        initialLat,
        initialLon,
        markLatitude,
        markLongitude,
        lastLat,
        lastLon
      );

      let mkVmg: number | undefined;
      let mkTtg: number | undefined;
      if (lastCog != null && lastSog != null) {
        mkVmg = lastSog * Math.cos(degToRad(lastCog - mkBearing));

        if (mkVmg > 0.1) {
          mkTtg = mkRange / mkVmg;
        }
      }

      console.log(
        `DTW=${(mkRange / 1852).toFixed(2)}nm, BTW=${mkBearing.toFixed(
          1
        )}deg, VMC=${mkVmg != null ? `${mkVmg.toFixed(2)}kn` : "n/a"} TTG=${
          mkTtg != null ? `${(mkTtg * 60).toFixed(1)}mins` : "n/a"
        } XTE=${mkXte.toFixed(1)}m`
      );

      send({
        Data: [
          { id: 14, inst: 0, sysVal: degToRad(mkBearing), valid: true },
          { id: 18, inst: 0, sysVal: mkXte / 1852, valid: true },
          { id: 21, inst: 0, sysVal: mkRange / 1852, valid: true },
          ...(mkTtg != null
            ? [{ id: 23, inst: 0, sysVal: mkTtg * 3600, valid: true }]
            : []),
          ...(mkVmg != null
            ? [{ id: 358, inst: 0, sysVal: mkVmg, valid: true }]
            : []),
        ],
      });
    }
  }
});

// 9 - COG
// 41 - SOG
// 421 - GPS Lat
// 422 - GPS Lon
// 14 - Bearing To Waypoint (degT)
// 18 - Cross Track Error (nm)
// 21 - Distance To Waypoint (nm)
// 23 - Time to Waypoint (hrs)
// 358 - VMG to Waypoint (kn)

export const EARTH_RADIUS = 6371000; // Radius of the earth in m
export const EARTH_CIRCUMFERENCE = EARTH_RADIUS * 2 * Math.PI;

/**
 * Returns the distance between two positions
 *
 * @param lat1 - The latitude of the first position in degrees
 * @param lon1 - The longitude of the first position in degrees
 * @param lat2 - The latitude of the second position in degrees
 * @param lon2 - The longitude of the second position in degrees
 *
 * @return number - The distance in meters
 */
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = EARTH_RADIUS * c; // Distance in m
  return d;
}

/**
 * Calculate the bearing between two positions as a value from 0-360
 *
 * @param lat1 - The latitude of the first position in degrees
 * @param lon1 - The longitude of the first position in degrees
 * @param lat2 - The latitude of the second position in degrees
 * @param lon2 - The longitude of the second position in degrees
 *
 * @return number - The bearing in degrees (between 0 and 360)
 */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = degToRad(lat1);
  const lon1Rad = degToRad(lon1);
  const lat2Rad = degToRad(lat2);
  const lon2Rad = degToRad(lon2);

  const dLon = lon2Rad - lon1Rad;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = radToDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * convert from degrees into radians
 *
 * @param deg - The degrees to be converted into radians
 * @return radians
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * convert from radians into degrees
 *
 * @param rad - The radians to be converted into degrees
 * @return degrees
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

const xte = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  lat3: number,
  lon3: number
) => {
  const d13 = getDistance(lat1, lon1, lat3, lon3);
  const s13 = d13 / EARTH_RADIUS;
  const t12 = degToRad(bearing(lat1, lon1, lat2, lon2));
  const t13 = degToRad(bearing(lat1, lon1, lat3, lon3));
  return Math.asin(Math.sin(s13) * Math.sin(t13 - t12)) * EARTH_RADIUS;
};
