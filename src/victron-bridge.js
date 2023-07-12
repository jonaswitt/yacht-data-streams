import { connect, MqttClient } from "mqtt";
import fetch from "node-fetch";
import dgram from "dgram";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { write } from "fs";

const udpClient = dgram.createSocket("udp4");

(async () => {
  const source = connect("mqtt://192.168.1.184");
  let instanceId = undefined;

  const influx = new InfluxDB({
    url: "http://localhost:8086",
    token:
      "zHLNYtPGm16qjMk9kEQm5y_SNPgIgqigAd0sLDzGeKKvriMEx5RrN2enfvU2RWF9j5Ur3nap8sOSDa9O-lkoqQ==",
  });
  const influxWriteApi = influx.getWriteApi("ovni", "victron");

  source.on("connect", () => {
    source.subscribe(
      [
        "#",
        // "N/+/keepalive",
        // "N/+/temperature/+/Temperature",
      ],
      (err, granted) => {
        if (err != null) {
          console.log(err, granted);
        }
      }
    );
  });

  let keepaliveInterval;
  source.on("message", async (topic, message, { qos, retain, dup }) => {
    console.log(topic, message.byteLength, "bytes", message.toString());

    if (instanceId == null) {
      const keepalive = topic.match(/N\/(\w+)\/keepalive/);
      if (keepalive != null) {
        instanceId = keepalive[1];
        source.publish(`R/${instanceId}/keepalive`, "", (err) => {
          // console.log("keepalive sent", err);
        });

        keepaliveInterval = setInterval(() => {
          source.publish(
            `R/${instanceId}/keepalive`,
            "", // JSON.stringify({ "keepalive-options": ["suppress-republish"] }),
            (err) => {
              // console.log("keepalive sent", err);
            }
          );
        }, 30000);
      }
    }

    if (topic.startsWith("N/")) {
      const topicRewrite = `victron12/${topic.slice(3 + instanceId.length)}`;

      // destination.publish(topicRewrite, message, { qos, retain, dup });

      try {
        const messageBody = JSON.parse(message.toString());
        if (
          typeof messageBody.value === "number" &&
          !Number.isNaN(messageBody.value)
        ) {
          const body = `boat ${topicRewrite}=${messageBody.value} ${
            Date.now() * 1000000
          }`;
          udpClient.send(body, 8094, "127.0.0.1");

          const point1 = new Point("victron")
            .tag("instance_id", instanceId)
            .floatField(topic.slice(3 + instanceId.length), messageBody.value);

          influxWriteApi.writePoint(point1);
          await influxWriteApi.flush();

          // console.log(point1);
        }
      } catch (ex) {
        console.warn(ex);
      }
    }
  });

  source.on("close", () => {
    console.log("source closed");
    if (keepaliveInterval != null) {
      clearInterval(keepaliveInterval);
    }
  });
})();
