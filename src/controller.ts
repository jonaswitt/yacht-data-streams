import fs from "fs";
import { flatMap, isEqual, keys } from "lodash";
import toml from "toml";
import { VictronMQTTInput } from "./victron-mqtt-input";
import { Input, Output, PointProcessor, RawPoint } from "./types";
import { H5000Input } from "./h5000-input";
import { UDPYDGWInput } from "./udp-ydgw-input";
import { Mapper } from "./mapping";
import { InfluxOutput } from "./influx-output";
import GrafanaWS from "./grafana-ws";
import GrafanaHTTP from "./grafana-http";
import ConsoleJsonWriter from "./console";
import { FilterOutput } from "./filter";
import path from "path";
import { DummyInput } from "./dummy-input";
import { UdpNjordOutput } from "./udp-njord-output";
import { FileOutput } from "./file-output";
import { WebsocketServer } from "./ws-server";
import { CortexInput } from "./cortex-input";

const INPUT_TYPE_MAP = {
  victron: VictronMQTTInput,
  h5000: H5000Input,
  ydgw: UDPYDGWInput,
  dummy: DummyInput,
  cortex: CortexInput,
};

const OUTPUT_TYPE_MAP = {
  console: ConsoleJsonWriter,
  "grafana-live": GrafanaHTTP,
  influxdb: InfluxOutput,
  "udp-njord": UdpNjordOutput,
  file: FileOutput,
  websocket: WebsocketServer,
};

type Config = {
  input?: Record<string, any>;
  output?: Record<string, any>;
  mapping?: {
    mappingFile?: string;
  };
};

type Managed<T> = {
  type: string;
  config: any;
  instance: T;
};

// Matches the desired config tables against the instances we already have and
// reuses every one whose table is unchanged, so a config edit only tears down
// what actually changed. Rebuilding everything on each reload dropped live
// connections (MQTT, Cortex) and, worse, recreated the websocket server while
// the previous one still held its port.
//
// Instances that are no longer wanted are closed *before* the replacements are
// constructed, so a changed output can rebind the same port.
const reconcile = <T>(
  existing: Managed<T>[],
  desired: Array<{ type: string; config: any }>,
  create: (type: string, config: any) => T
): Managed<T>[] => {
  const pool = [...existing];
  const reused = desired.map(({ type, config }) => {
    const idx = pool.findIndex(
      (e) => e.type === type && isEqual(e.config, config)
    );
    return idx >= 0 ? pool.splice(idx, 1)[0] : undefined;
  });

  for (const stale of pool) {
    try {
      (stale.instance as { close?: () => void }).close?.();
    } catch (ex) {
      console.warn(ex);
    }
  }

  return desired.map(
    (d, i) => reused[i] ?? { ...d, instance: create(d.type, d.config) }
  );
};

export class Controller {
  private configFilePath: string;

  private config: Config | undefined;

  private inputs: Managed<Input>[] = [];

  private processors: PointProcessor[] = [];

  private outputs: Managed<Output>[] = [];

  private localDateTimeOffset: number | undefined;

  public constructor(configFilePath: string) {
    this.configFilePath = configFilePath;

    this.readConfig().then(async () => {
      while (true) {
        for await (const e of fs.promises.watch(this.configFilePath)) {
          let retries = 0;
          while (retries < 3) {
            try {
              if (await this.readConfig()) {
                console.log("Config file changed, reloaded");
              }
              break;
            } catch (ex) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          // renew watch
          break;
        }
      }
    });
  }

  private async readConfig() {
    const data = await fs.promises.readFile(this.configFilePath, "utf-8");
    const fileContent = toml.parse(data) as Config;
    if (isEqual(this.config, fileContent)) {
      return false;
    }
    // console.log(JSON.stringify(fileContent, null, 2));
    this.applyConfig(fileContent, this.config);
    this.config = fileContent;

    return true;
  }

  private applyConfig(newConfig: Config, oldConfig?: Config) {
    const invalidInputTypes = keys(newConfig.input ?? {}).filter(
      (key) => INPUT_TYPE_MAP[key] == null
    );
    if (invalidInputTypes.length > 0) {
      throw new Error(`Invalid input types: ${invalidInputTypes.join(", ")}`);
    }
    const invalidOutputTypes = keys(newConfig.output ?? {}).filter(
      (key) => OUTPUT_TYPE_MAP[key] == null
    );
    if (invalidOutputTypes.length > 0) {
      throw new Error(`Invalid output types: ${invalidOutputTypes.join(", ")}`);
    }

    this.inputs = reconcile(
      this.inputs,
      flatMap(keys(INPUT_TYPE_MAP), (inputType) =>
        (newConfig.input?.[inputType] ?? []).map((config: any) => ({
          type: inputType,
          config,
        }))
      ),
      (inputType, inputConfig) => {
        const input = new INPUT_TYPE_MAP[inputType](inputConfig);
        input.onPoint = this.handlePoint.bind(this);
        (input as H5000Input).onDateTime = this.handleDateTime.bind(this);
        return input;
      }
    );

    this.processors = [
      ...(newConfig.mapping?.mappingFile != null
        ? [
            new Mapper(
              path.join(
                path.dirname(this.configFilePath),
                newConfig.mapping.mappingFile
              )
            ),
          ]
        : []),
    ];

    this.outputs = reconcile(
      this.outputs,
      flatMap(keys(OUTPUT_TYPE_MAP), (outputType) =>
        (newConfig.output?.[outputType] ?? []).map((config: any) => ({
          type: outputType,
          config,
        }))
      ),
      (outputType, { namepass, ...outputConfig }) => {
        const output = new OUTPUT_TYPE_MAP[outputType](outputConfig);
        if (namepass != null) {
          return new FilterOutput(output, { namepass });
        }
        return output;
      }
    );
  }

  private async handlePoint(point: RawPoint) {
    if (point.timestamp == null) {
      if (this.localDateTimeOffset != null) {
        point.timestamp = new Date(Date.now() + this.localDateTimeOffset);
      } else {
        point.timestamp = new Date();
      }
    }

    const processed = this.processors.reduce(
      (acc, plugin) => plugin.process(acc),
      [point]
    );

    for (const p of processed) {
      for (const { instance: output } of this.outputs) {
        try {
          await output.write(p);
        } catch (ex) {
          console.warn(ex);
        }
      }
    }
  }

  private handleDateTime(timestamp: Date) {
    this.localDateTimeOffset = timestamp.valueOf() - Date.now();
  }
}
