#!/usr/bin/env node

import minimist from "minimist";
import { WebSocketServer } from "ws";

const argv = minimist(process.argv.slice(2), {
  alias: { p: "port", h: "help" },
});

if (argv["help"]) {
  console.error(`Usage: h5000-dummy-ws-server [-p|--port PORT]

Options:
  -p, --port PORT  Port to listen on (default: 8080)
  -h, --help       output usage information`);
  process.exit(1);
}

const wss = new WebSocketServer({ port: Number(argv.port ?? 8080) });

console.log(
  `h5000-dummy-ws-server listening on websocket port ${wss.options.port}`
);

wss.on("connection", function connection(ws) {
  const subscriptions = new Set<number>();

  let dataInterval: NodeJS.Timer | undefined = setInterval(() => {
    if (subscriptions.size > 0) {
      const values = [...subscriptions].map((id) => {
        return {
          id: id,
          val: id,
          valStr: id.toString(),
          sysVal: id,
          inst: 0,
          valid: true,
        };
      });

      ws.send(
        JSON.stringify({
          Data: values,
        })
      );
    }
  }, 1000);

  ws.on("error", console.error);

  ws.on("message", function message(data) {
    const msg = JSON.parse(data.toString("utf-8"));
    if (msg.DataListReq != null) {
      // {"DataListReq":{"groupId":1}}
      const group = GROUPS.find((g) => g[1] === msg.DataListReq.groupId);
      ws.send(
        JSON.stringify({
          DataList: {
            groupId: msg.DataListReq.groupId,
            list: DATAS.filter((d) => d[2] === group?.[0]).map((d) => d[1]),
          },
        })
      );
    } else if (msg.DataInfoReq != null) {
      //   {"DataInfoReq":[40]}
      const infos = msg.DataInfoReq.map((id) => {
        const data = DATAS.find((d) => d[1] === id);
        return {
          id,
          sname: data?.[0] ?? id.toString(),
          lname: data?.[0] ?? id.toString(),
          unit: "Knts",
          min: 0,
          max: 99.9,
          numInstances: 1,
          instanceInfo: [{ inst: 0, location: 0, str: "Instance" }],
        };
      });

      ws.send(
        JSON.stringify({
          DataInfo: infos,
        })
      );
    } else if (msg.DataReq != null) {
      // {"DataReq":[{"id":1,"repeat":false,"inst":0}]}

      const values = msg.DataReq.map(({ id, inst }) => {
        return {
          id: id,
          val: id,
          valStr: id.toString(),
          sysVal: id,
          inst: inst,
          valid: true,
        };
      });

      ws.send(
        JSON.stringify({
          Data: values,
        })
      );

      msg.DataReq.filter(({ repeat }) => repeat)
        .map(({ id }) => id)
        .forEach((id) => {
          subscriptions.add(id);
        });
    } else if (msg.UnsubscribeData != null) {
      // {"UnsubscribeData":[{"id":1,"inst":0}]}

      msg.UnsubscribeData.map(({ id }) => id).forEach((id) => {
        subscriptions.delete(id);
      });
    } else if (msg.EventSet != null) {
      // {"EventSet":[{"id":5,"active":true}]}
      // {"EventSet":[{"id":5, "latitude":50.9892, "longitude":-1.4975,“name”:“Waypoint1”}]}
    }
  });

  ws.on("close", function close() {
    if (dataInterval != null) {
      clearInterval(dataInterval);
      dataInterval = undefined;
    }
  });
});

const GROUPS = [
  ["GPS", 1],
  ["Navigation", 2],
  ["Vessel", 3],
  ["Sonar", 4],
  ["Weather", 5],
  ["Trip", 6],
  ["Time", 7],
  ["Engine", 8],
  ["Transmission", 9],
  ["Fuel Tank", 10],
  ["Fresh Water Tank", 11],
  ["Gray Water Tank", 12],
  ["Live Well Tank", 13],
  ["Oil Tank", 14],
  ["Black Water Tank", 15],
  ["Engine Room", 16],
  ["Cabin", 17],
  ["Bait Well", 18],
  ["Refrigerator", 19],
  ["Heating System", 20],
  ["Freezer", 21],
  ["Battery", 22],
  ["Rudder", 23],
  ["Trim Tab", 24],
  ["AC Input", 25],
  ["Digital Switching", 26],
  ["Other", 27],
  ["GPS Status", 28],
  ["Route Data", 29],
  ["Speed Depth", 30],
  ["Log Timer", 31],
  ["Environment", 32],
  ["Wind", 33],
  ["Pilot", 34],
  ["Sailing", 35],
  ["AC Output", 36],
  ["Charger", 37],
  ["Inverter", 38],
];

const DATAS = [
  ["Altitude", 1, "GPS"],
  ["Position Error", 3, "GPS"],
  ["HDOP", 4, "GPS Status"],
  ["VDOP", 5, "GPS Status"],
  ["TDOP", 6, "GPS Status"],
  ["PDOP", 7, "GPS Status"],
  ["Geoidal Seperation", 8, "GPS Status"],
  ["COG", 9, "GPS"],
  ["Position Quality", 10, "GPS Status"],
  ["Position Integrity", 11, "GPS Status"],
  ["Satellites In View", 12, "GPS Status"],
  ["WAAS Status", 13, "GPS Status"],
  ["Bearing (To Waypoint)", 14, "Navigation"],
  ["Bearing Origin to Waypoint", 15, "Navigation"],
  ["Course To Steer", 17, "Navigation"],
  ["Cross Track Error", 18, "Navigation"],
  ["VMG to Waypoint", 19, "Navigation"],
  ["Destination", 20, "Navigation"],
  ["Distance to Turn", 21, "Navigation"],
  ["Distance to Destination", 22, "Navigation"],
  ["Time To Turn", 23, "Route Data"],
  ["Time To Destination", 24, "Route Data"],
  ["ETA At Turn", 25, "Route Data"],
  ["ETA At Destination", 26, "Route Data"],
  ["Total Distance", 27, "Route Data"],
  ["Steer Arrow", 28, "Navigation"],
  ["Odometer", 29, "Trip"],
  ["Trip Distance", 30, "Trip"],
  ["Trip Time", 31, "Trip"],
  ["Local Date", 32, "Time"],
  ["Local Time", 33, "Time"],
  ["UTC Date", 34, "Time"],
  ["UTC Time", 35, "Time"],
  ["Local Time Offset", 36, "Time"],
  ["Heading", 37, "Vessel"],
  ["Voltage", 38, "Other"],
  ["Current Set", 39, "Other"],
  ["Current Drift", 40, "Other"],
  ["SOG", 41, "GPS"],
  ["Water Speed", 42, "Sonar"],
  ["Pitot Speed", 43, "Vessel"],
  ["Average Trip Speed", 44, "Trip"],
  ["Maximum Trip Speed", 45, "Trip"],
  ["Apparent Wind Speed", 46, "Weather"],
  ["True Wind Speed", 47, "Weather"],
  ["Water Temperature", 48, "Sonar"],
  ["Outside Temperature", 49, "Weather"],
  ["Inside Temperature", 50, "Vessel"],
  ["Engine Room Temperature", 51, "Engine Room"],
  ["Main Cabin Temperature", 52, "Cabin"],
  ["Live Well Temperature", 53, "Live Well Tank"],
  ["Bait Well Temperature", 54, "Bait Well"],
  ["Refrigeration Temperature", 55, "Refrigerator"],
  ["Heating System Temperature", 56, "Heating System"],
  ["Dew Point Temperature", 57, "Weather"],
  ["Apparent Wind Chill Temperature", 58, "Weather"],
  ["Theoretic Wind Chill Temperature", 59, "Weather"],
  ["Heat Index Temperature", 60, "Weather"],
  ["Freezer Temperature", 61, "Freezer"],
  ["Engine Temperature", 62, "Engine"],
  ["Engine Air Temperature", 63, "Engine"],
  ["Engine Oil Temperature", 64, "Engine"],
  ["Battery Temperature", 65, "Battery"],
  ["Atmospheric Pressure", 66, "Weather"],
  ["Engine Boost Pressure", 67, "Engine"],
  ["Engine Oil Pressure", 68, "Engine"],
  ["Engine Water Pressure", 69, "Engine"],
  ["Engine Fuel Pressure", 70, "Engine"],
  ["Engine Manifold Pressure", 71, "Engine"],
  ["Stream Pressure", 72, "Other"],
  ["Compressed Air Pressure", 73, "Other"],
  ["Hydraulic Pressure", 74, "Other"],
  ["Depth", 77, "Sonar"],
  ["Water Distance", 78, "Sonar"],
  ["Engine RPM", 79, "Engine"],
  ["Engine Trim", 80, "Engine"],
  ["Engine Alternator Potential", 81, "Engine"],
  ["Engine Fuel Rate", 82, "Engine"],
  ["Engine Percent Load", 83, "Engine"],
  ["Engine Percent Torque", 84, "Engine"],
  ["Suzuki Alarm Level Low", 85, "Engine"],
  ["Suzuki Alarm Level High", 86, "Engine"],
  ["Fuel Tank Level", 87, "Fuel Tank"],
  ["Fresh Water Fluid Level", 88, "Fresh Water Tank"],
  ["Gray Water Fluid Level", 89, "Gray Water Tank"],
  ["Live Well Fluid Level", 90, "Live Well Tank"],
  ["Oil Fluid Level", 91, "Oil Tank"],
  ["Black Water Fluid Level", 92, "Black Water Tank"],
  ["Fuel Remaining", 93, "Fuel Tank"],
  ["Fresh Water Fluid Volume", 94, "Fresh Water Tank"],
  ["Gray Water Fluid Volume", 95, "Gray Water Tank"],
  ["Live Well Fluid Volume", 96, "Live Well Tank"],
  ["Oil Fluid Volume", 97, "Oil Tank"],
  ["Black Water Fluid Volume", 98, "Black Water Tank"],
  ["Generic Fluid Volume", 99, "Unconfigured"],
  ["Generic Tank Capacity", 105, "Unconfigured"],
  ["Fuel Tank Capacity", 106, "Fuel Tank"],
  ["Fresh Water Tank Capacity", 107, "Fresh Water Tank"],
  ["Gray Water Tank Capacity", 108, "Gray Water Tank"],
  ["Live Well Tank Capacity", 109, "Live Well Tank"],
  ["Oil Tank Capacity", 110, "Oil Tank"],
  ["Black Water Tank Capacity", 111, "Black Water Tank"],
  ["Tank Fuel Used", 112, "Fuel Tank"],
  ["Engine Fuel Used", 113, "Engine"],
  ["Trip Fuel Used", 114, "Engine"],
  ["Seasonal Fuel Used", 115, "Engine"],
  ["K Value", 116, "Engine"],
  ["Battery Potential", 117, "Battery"],
  ["Battery Current", 118, "Battery"],
  ["Trim Tab", 119, "Trim Tab"],
  ["Rate Of Turn", 121, "Vessel"],
  ["Yaw", 122, "Vessel"],
  ["Pitch", 123, "Vessel"],
  ["Roll", 124, "Vessel"],
  ["Magnetic Variation", 125, "Other"],
  ["Deviation", 126, "Other"],
  ["Water Fuel Economy", 127, "Engine"],
  ["GPS Fuel Economy", 128, "Engine"],
  ["Water Fuel Range", 130, "Engine"],
  ["GPS Fuel Range", 131, "Engine"],
  ["Engine Hours Used", 132, "Engine"],
  ["Engine Type", 133, "Engine"],
  ["Vessel Fuel Rate", 134, "Vessel"],
  ["Vessel Water Fuel Economy", 135, "Vessel"],
  ["Vessel GPS Fuel Economy", 136, "Vessel"],
  ["Vessel Fuel Remaining", 137, "Vessel"],
  ["Vessel Water Fuel Range", 138, "Vessel"],
  ["Vessel GPS Fuel Range", 139, "Vessel"],
  ["Apparent Wind Angle", 140, "Weather"],
  ["True Wind Angle", 141, "Weather"],
  ["True Wind Direction", 142, "Weather"],
  ["Inside Humidity", 143, "Vessel"],
  ["Outside Humidity", 144, "Weather"],
  ["Set Humidity", 145, "Vessel"],
  ["Rudder Angle", 146, "Rudder"],
  ["Transmission Gear", 147, "Transmission"],
  ["Transmission Oil Pressure", 148, "Transmission"],
  ["Transmission Oil Temperature", 149, "Transmission"],
  ["Commanded Rudder Angle", 150, "Rudder"],
  ["Rudder Limit", 151, "Rudder"],
  ["Off Heading Limit", 152, "Vessel"],
  ["Radius of Turn Order", 153, "Vessel"],
  ["Rate of Turn Order", 154, "Vessel"],
  ["Off Track Limit", 155, "Vessel"],
  ["Logging Time Remaining", 156, "Other"],
  ["Position Fix Type", 157, "GPS Status"],
  ["Engine Discrete Status", 158, "Engine"],
  ["Transmission Discrete Status", 159, "Transmission"],
  ["GPS Best of Four Signal to Noise Ratio", 160, "GPS Status"],
  ["Generic Fluid Level", 161, "Unconfigured"],
  ["Generic Pressure", 162, "Unconfigured"],
  ["Generic Temperature", 163, "Unconfigured"],
  ["Internal Voltage", 164, "Other"],
  ["Structure Depth", 166, "Sonar"],
  ["Loran Position", 167, "Vessel"],
  ["Vessel Status", 168, "Vessel"],
  ["Battery DC Type", 169, "Battery"],
  ["Battery State of Charge", 170, "Battery"],
  ["Battery State of Health", 171, "Battery"],
  ["Battery Time Remaining", 172, "Battery"],
  ["Battery Ripple Voltage", 173, "Battery"],
  ["AC Input 1 Quality", 174, "AC Input"],
  ["AC Input 2 Quality", 175, "AC Input"],
  ["AC Input 3 Quality", 176, "AC Input"],
  ["AC Input 1 Voltage", 177, "AC Input"],
  ["AC Input 2 Voltage", 178, "AC Input"],
  ["AC Input 3 Voltage", 179, "AC Input"],
  ["AC Input 1 Current", 180, "AC Input"],
  ["AC Input 2 Current", 181, "AC Input"],
  ["AC Input 3 Current", 182, "AC Input"],
  ["AC Input 1 Frequency", 183, "AC Input"],
  ["AC Input 2 Frequency", 184, "AC Input"],
  ["AC Input 3 Frequency", 185, "AC Input"],
  ["AC Input 1 Breaker Size", 186, "AC Input"],
  ["AC Input 2 Breaker Size", 187, "AC Input"],
  ["AC Input 3 Breaker Size", 188, "AC Input"],
  ["AC Input 1 Real Power", 189, "AC Input"],
  ["AC Input 2 Real Power", 190, "AC Input"],
  ["AC Input 3 Real Power", 191, "AC Input"],
  ["AC Input 1 Reactive Power", 192, "AC Input"],
  ["AC Input 2 Reactive Power", 193, "AC Input"],
  ["AC Input 3 Reactive Power", 194, "AC Input"],
  ["AC Input 1 Power Factor", 195, "AC Input"],
  ["AC Input 2 Power Factor", 196, "AC Input"],
  ["AC Input 3 Power Factor", 197, "AC Input"],
  ["Switch State", 198, "Digital Switching"],
  ["Switch Current", 199, "Digital Switching"],
  ["Switch Fault", 200, "Digital Switching"],
  ["Switch Dim Level", 201, "Digital Switching"],
  ["Previous Commanded Heading", 202, "Pilot"],
  ["Commanded Wind Angle", 203, "Pilot"],
  ["Commanded Bearing Offset", 204, "Pilot"],
  ["Commanded Bearing", 205, "Pilot"],
  ["Commanded Depth Contour", 206, "Pilot"],
  ["Commanded Course Change", 207, "Pilot"],
  ["Pilot Drift", 208, "Pilot"],
  ["Pilot Distance To Turn", 209, "Pilot"],
  ["Pilot Time To Turn", 210, "Pilot"],
  ["Pilot Reference Position", 211, "Pilot"],
  ["DC Status", 212, "Battery"],
  ["AC Input 1 Status", 213, "AC Input"],
  ["Switch Voltage", 214, "Digital Switching"],
  ["Battery Capacity Remaining", 215, "Battery"],
  ["H3000 Linear 1", 217, "Sailing"],
  ["H3000 Linear 2", 218, "Sailing"],
  ["H3000 Linear 3", 219, "Sailing"],
  ["Boom Position", 220, "Sailing"],
  ["Sailing Course", 221, "Sailing"],
  ["Daggerboard Position", 222, "Sailing"],
  ["H3000 Linear 4", 223, "Sailing"],
  ["Heading on Next Tack", 224, "Sailing"],
  ["Keel Angle", 225, "Sailing"],
  ["Leeway", 226, "Sailing"],
  ["Mast Angle", 227, "Sailing"],
  ["Target True Wind Angle", 228, "Sailing"],
  ["Keel Trim Tab", 229, "Sailing"],
  ["Race Timer", 230, "Sailing"],
  ["Canard Angle", 231, "Sailing"],
  ["Next Leg Apparent Wind Angle", 232, "Sailing"],
  ["Next Leg Apparent Wind Speed", 233, "Sailing"],
  ["Target Boat Speed", 234, "Sailing"],
  ["VMG to Wind", 235, "Sailing"],
  ["Time to Layline", 236, "Sailing"],
  ["Distance to Layline", 237, "Sailing"],
  ["Aft Depth", 238, "Sonar"],
  ["Fore Stay", 239, "Sailing"],
  ["Polar Speed", 240, "Sailing"],
  ["Polar Performance", 241, "Sailing"],
  ["Tacking Performance", 242, "Sailing"],
  ["Wind Angle To Mast", 243, "Sailing"],
  ["CAN Bus Voltage", 244, "Other"],
  ["Internal Temperature", 245, "Other"],
  ["Engage Current", 246, "Other"],
  ["URef Voltage", 247, "Other"],
  ["Supply Voltage", 248, "Other"],
  ["Destination Position", 249, "Navigation"],
  ["Engine Sync State", 252, "Engine"],
  ["Engine Predictive General Maintenance", 253, "Engine"],
  ["Engine Throttle", 254, "Engine"],
  ["Engine Steering Angle", 255, "Engine"],
  ["Engine Break In Required", 256, "Engine"],
  ["Engine Break In Remaining", 258, "Engine"],
  ["Engine Trim Status", 259, "Engine"],
  ["Autopilot Present", 260, "Pilot"],
  ["AC Output 1 Quality", 261, "AC Output"],
  ["AC Output 2 Quality", 262, "AC Output"],
  ["AC Output 3 Quality", 263, "AC Output"],
  ["AC Output 1 Voltage", 264, "AC Output"],
  ["AC Output 2 Voltage", 265, "AC Output"],
  ["AC Output 3 Voltage", 266, "AC Output"],
  ["AC Output 1 Current", 267, "AC Output"],
  ["AC Output 2 Current", 268, "AC Output"],
  ["AC Output 3 Current", 269, "AC Output"],
  ["AC Output 1 Frequency", 270, "AC Output"],
  ["AC Output 2 Frequency", 271, "AC Output"],
  ["AC Output 3 Frequency", 272, "AC Output"],
  ["AC Output 1 Breaker Size", 273, "AC Output"],
  ["AC Output 2 Breaker Size", 274, "AC Output"],
  ["AC Output 3 Breaker Size", 275, "AC Output"],
  ["AC Output 1 Real Power", 276, "AC Output"],
  ["AC Output 2 Real Power", 277, "AC Output"],
  ["AC Output 3 Real Power", 278, "AC Output"],
  ["AC Output 1 Reactive Power", 279, "AC Output"],
  ["AC Output 2 Reactive Power", 280, "AC Output"],
  ["AC Output 3 Reactive Power", 281, "AC Output"],
  ["AC Output 1 Power Factor", 282, "AC Output"],
  ["AC Output 2 Power Factor", 283, "AC Output"],
  ["AC Output 3 Power Factor", 284, "AC Output"],
  ["AC Input 2 Status", 285, "AC Input"],
  ["AC Input 3 Status", 286, "AC Input"],
  ["AC Output 1 Status", 287, "AC Output"],
  ["AC Output 2 Status", 288, "AC Output"],
  ["AC Output 3 Status", 289, "AC Output"],
  ["Switch Manual Override", 290, "Digital Switching"],
  ["Switch Reverse Polarity", 291, "Digital Switching"],
  ["Switch AC Source Available", 292, "Digital Switching"],
  ["Switch AC Contactor System On State", 293, "Digital Switching"],
  ["Charger Battery Instance", 294, "Charger"],
  ["Charger Operating State", 295, "Charger"],
  ["Charger Mode", 296, "Charger"],
  ["Charger Enabled", 297, "Charger"],
  ["Charger Equalization Pending", 298, "Charger"],
  ["Charger Equalization Time Remaining", 299, "Charger"],
  ["Inverter AC Instance", 300, "Inverter"],
  ["Inverter DC Instance", 301, "Inverter"],
  ["Inverter Operating State", 302, "Inverter"],
  ["Inverter Enabled", 303, "Inverter"],
  ["Sailing Time To Waypoint", 304, "Sailing"],
  ["Sailing Distance To Waypoint", 305, "Sailing"],
  ["Sailing ETA", 306, "Sailing"],
  ["Latitude", 309, "GPS"],
  ["Longitude", 310, "GPS"],
];
