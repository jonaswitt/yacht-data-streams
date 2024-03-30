import { connect, MqttClient } from "mqtt";
import { RawPoint } from "./types";

export class VictronMQTTInput {
  private source: MqttClient;

  public onPoint: ((point: RawPoint) => void) | undefined;

  public constructor({
    url,
    clientId = "victron-influx-bridge",
    measurement = "victron",
    tagInstance,
    tagDevice,
  }: {
    url: string;
    clientId?: string;
    measurement?: string;
    tagInstance?: boolean | string;
    tagDevice?: boolean;
  }) {
    this.source = connect(url, {
      clientId,
    });

    let instanceId: string | undefined = undefined;
    this.source.on("connect", () => {
      console.log("MQTT connected");
      instanceId = undefined;
      this.source.subscribe(["#"], (err, granted) => {
        if (err != null) {
          console.log(err, granted);
        }
      });
    });

    let keepaliveInterval;
    this.source.on(
      "message",
      async (topic, message, { qos, retain, dup, properties }) => {
        // console.log(
        //   `${topic} ${message.byteLength} bytes: ${message.toString()}`
        // );

        if (instanceId == null) {
          const keepalive = topic.match(
            /N\/(\w+)\/(keepalive|system\/0\/Serial)/
          );
          if (keepalive != null) {
            instanceId = keepalive[1];
            this.source.publish(`R/${instanceId}/keepalive`, "", (err) => {
              // console.log("keepalive sent", err);
            });

            keepaliveInterval = setInterval(() => {
              this.source.publish(
                `R/${instanceId}/keepalive`,
                "", // JSON.stringify({ "keepalive-options": ["suppress-republish"] }),
                (err) => {
                  // console.log("keepalive sent", err);
                }
              );
            }, 30000);
          }
        }

        if (
          topic.startsWith("N/") &&
          message.byteLength > 0 &&
          instanceId != null
        ) {
          let field = topic.slice(3 + instanceId.length);

          try {
            const messageBody = JSON.parse(message.toString());
            if (
              messageBody.value != null &&
              field !== "keepalive" &&
              ((typeof messageBody.value === "number" &&
                !Number.isNaN(messageBody.value)) ||
                (typeof messageBody.value === "string" &&
                  messageBody.value.length > 0))
            ) {
              let tags: { [key: string]: string } | undefined;
              const [serviceType, deviceInstance, ...dbusPath] =
                field.split("/");

              if (tagInstance) {
                tags = {
                  instance:
                    typeof tagInstance === "string" ? tagInstance : instanceId,
                };
              }

              if (tagDevice && deviceInstance != null) {
                tags = {
                  ...tags,
                  device: deviceInstance,
                };
                field = [serviceType, ...dbusPath].join("/");
              }

              this.onPoint?.({
                measurement,
                timestamp: new Date(),
                fields: {
                  [field]: messageBody.value,
                },
                tags,
              });
            }
          } catch (ex) {
            console.warn("error parsing", ex);
          }
        }
      }
    );

    this.source.on("close", () => {
      console.log("MQTT closed");
      if (keepaliveInterval != null) {
        clearInterval(keepaliveInterval);
      }

      // source.reconnect();
    });

    this.source.on("error", (err) => {
      console.log("MQTT error", err);
    });

    this.source.on("disconnect", () => {
      console.log("MQTT disconnect");
    });

    this.source.on("reconnect", () => {
      console.log("MQTT reconnect");
    });
  }

  public close() {
    this.source.end();
  }
}
