import { keys } from "lodash";
import { connect, MqttClient } from "mqtt";
import { Readable } from "stream";

class MQTT extends Readable {
  private client: MqttClient;

  constructor(instanceId: string, topicToMetric: Record<string, string>) {
    super({
      objectMode: true,
    });

    this.client = connect("mqtt://192.168.1.184");

    this.client.on("connect", () => {
      this.client.subscribe(
        [`N/${instanceId}/keepalive`, ...keys(topicToMetric)],
        (err, granted) => {
          console.log(err, granted);
        }
      );

      this.client.publish(`R/${instanceId}/keepalive`, "", (err) => {
        // console.log("keepalive sent", err);
      });
    });

    this.client.on("message", (topic, message) => {
      const metric = topicToMetric[topic];
      if (!metric) {
        return;
      }
      let body;
      try {
        body = JSON.parse(message.toString());
      } catch {}
      //   console.log(topic, metric, body);

      if (body?.value) {
        this.push({
          timestamp: Date.now(),
          records: {
            [metric]: body.value,
          },
        });
      }
    });

    setInterval(() => {
      this.client.publish(`R/${instanceId}/keepalive`, "", (err) => {
        // console.log("keepalive sent", err);
      });
    }, 60_000);
  }

  _read(size: number): void {}
}

export default MQTT;
