import EventEmitter from "events";
import fetch from "node-fetch";
import WebSocket from "ws";

// Send a "ping" if there was no message for 30 seconds
const NO_DATA_TIMEOUT = 30_000;

// After "ping", wait 5 seconds for a "pong" or any other message
const PONG_TIMEOUT = 5_000;

export type CortexChannel =
  | "ExternalHeading"
  | "TargetControl"
  | "TargetCalculationsLite"
  | "TargetSafetyMessage"
  | "TargetInfo"
  | "Depth"
  | "TargetName"
  | "CollisionProfileControl"
  | "DataSourceDevices"
  | "MonitorModeControl"
  | "AlarmSound"
  | "WaterTemperature"
  | "InternalHeading"
  | "ActiveAlarm"
  | "NMEA0183Control"
  | "LoudSpeakerControl"
  | "AnchorWatch"
  | "GPIOValue"
  | "DeviceInfo"
  | "WiFiScanResult"
  | "AlarmSilenceAffordance"
  | "AlarmTypeControls"
  | "TransponderControl"
  | "CollisionProfiles"
  | "WiFiNetworkControl"
  | "GPSControl"
  | "ExternalSpeakerControl"
  | "AnchorWatchControl"
  | "TargetPosition"
  | "InternalHeadingControl"
  | "BatteryVoltage"
  | "Broadcast"
  | "NetworkDiagnostic"
  | "HeartBeat"
  | "BatteryVoltageOffset"
  | "LocationFix"
  | "DataSource"
  | "Simulations"
  | "BarometricPressureOffset"
  | "ExternalGPIO"
  | "VesselControl"
  | "WaterSpeed"
  | "Wind"
  | "VesselPositionHistory"
  | "GPIOControl"
  | "BoatNetworkStatus"
  | "Waypoint"
  | "NMEA2000Control"
  | "HornControl"
  | "CloudNetworkControl"
  | "Heading"
  | "VesselPositionUnderway"
  | "HornSignalStatus"
  | "SimulationControl"
  | "InternalBarometerControl"
  | "TargetListControl"
  | "TransponderStatus"
  | "WaypointDirectory"
  | "Vessel"
  | "VesselDirectory"
  | "BarometricPressure"
  | string;

export class CortexWebsocket extends EventEmitter {
  private host: string;

  private shouldBeConnected = true;

  private websocketPromise: Promise<WebSocket> | undefined;

  private numConnectionAttempts = 0;

  private websocket: WebSocket | undefined;

  private lastPong: Date | undefined;

  private noDataTimeout: NodeJS.Timeout | undefined;

  private pongTimeout: NodeJS.Timeout | undefined;

  private token: string | undefined;

  private subscribeChannels = new Set<CortexChannel>(["HeartBeat"]);

  public constructor(host: string, channels?: Iterable<CortexChannel>) {
    super();
    this.host = host;
    for (const channel of channels ?? []) {
      this.subscribeChannels.add(channel);
    }

    this.connect().catch(() => {});
  }

  public async connect() {
    this.shouldBeConnected = true;

    if (this.websocketPromise != null) {
      return this.websocketPromise;
    }

    this.websocketPromise = this.connectInternal();

    return this.websocketPromise;
  }

  private async connectInternal() {
    if (this.websocket != null) {
      return this.websocket;
    }

    const setNoDataTimeout = () => {
      if (this.pongTimeout != null) {
        clearTimeout(this.pongTimeout);
      }
      if (this.noDataTimeout != null) {
        clearTimeout(this.noDataTimeout);
      }
      this.noDataTimeout = setTimeout(() => {
        if (
          this.lastPong != null &&
          this.lastPong.valueOf() > Date.now() - NO_DATA_TIMEOUT / 2
        ) {
          // Ok, data received since timeout was set
          return;
        }

        console.log("Cortex no data timeout elapsed, sending ping");
        if (this.pongTimeout != null) {
          clearTimeout(this.pongTimeout);
        }
        this.pongTimeout = setTimeout(() => {
          if (
            this.lastPong != null &&
            this.lastPong.valueOf() > Date.now() - PONG_TIMEOUT
          ) {
            // Ok, data received since timeout was set
            return;
          }

          console.log(
            "Cortex pong timeout elapsed, closing/reconnecting websocket"
          );
          this.websocket?.close();
        }, PONG_TIMEOUT);

        // Send ping
        // TBD: does Cortex respond to WS ping?
        this.websocket?.ping();
      }, NO_DATA_TIMEOUT);
    };

    return new Promise<WebSocket>((resolve, reject) => {
      this.numConnectionAttempts += 1;

      this.websocket = new WebSocket(
        `ws://${this.host}:8000/v3/openChannel?generateToken`,
        undefined,
        {
          handshakeTimeout: 5_000,
        }
      );

      this.websocket.on("open", () => {
        console.log("Cortex websocket connected");
        this.numConnectionAttempts = 0;
        resolve(this.websocket);

        this.emit("open");

        setNoDataTimeout();
      });

      this.websocket.on("message", (data) => {
        this.lastPong = new Date();
        setNoDataTimeout();

        const match = data.toString().match(/(\d+):(\w+)(.*)/);
        if (match == null) {
          return;
        }
        const [_, msgId, msgType, payloadStr] = match;
        const payload = JSON.parse(payloadStr);

        switch (msgType) {
          case "ChannelIdentifier":
            this.token = payload.token;
            for (const channel of this.subscribeChannels) {
              this.subscribe(channel);
            }
            break;

          case "HeartBeat":
            break;

          default:
            this.emit("message", msgType, payload);
            break;
        }
      });

      this.websocket.on("pong", () => {
        this.lastPong = new Date();
      });

      this.websocket.on("error", (e) => {
        console.error("Cortex connection error", e.message);
        this.websocket = undefined;
        this.websocketPromise = undefined;
        reject(e);
      });

      this.websocket.on("close", (code, msg) => {
        this.websocket = undefined;
        this.websocketPromise = undefined;
        if (this.noDataTimeout != null) {
          clearTimeout(this.noDataTimeout);
        }
        this.noDataTimeout = undefined;
        if (this.pongTimeout != null) {
          clearTimeout(this.pongTimeout);
        }
        this.pongTimeout = undefined;
        this.triggerReconnect();
      });
    });
  }

  public close() {
    this.shouldBeConnected = false;
    this.websocket?.close();
    this.websocket = undefined;
    this.websocketPromise = undefined;
    this.token = undefined;
    this.numConnectionAttempts = 0;
  }

  private triggerReconnect() {
    if (!this.shouldBeConnected) {
      return;
    }

    const delay = Math.min(60, 2 ** Math.max(1, this.numConnectionAttempts));
    console.log(`Cortex reconnecting in ${delay} sec...`);

    setTimeout(() => {
      this.connect().catch(() => undefined);
    }, delay * 1000);
  }

  public async subscribe(channel: CortexChannel) {
    this.subscribeChannels.add(channel);

    if (this.token == null) {
      return;
    }

    const res = await fetch(
      `http://${this.host}:8000/v3/subscribeChannel/${channel}?token=${this.token}`
    );
    if (!res.ok) {
      throw new Error("Failed to subscribe to channel");
    }
    const data = await res.text();
  }
}
