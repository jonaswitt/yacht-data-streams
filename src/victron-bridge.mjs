import { connect, MqttClient } from "mqtt";
import dgram from "dgram";

const udpClient = dgram.createSocket("udp4");

const mapping = {
  // "temperature/20/Temperature": "TemperatureWork",
  // "temperature/21/Temperature": "TemperatureLiving",
  // "temperature/22/Temperature": "TemperatureOutdoor",
};

const escapeKey = (key) => key.replace(/[,= ]/g, (m) => `\\${m}`);
const escapeValue = (value) => JSON.stringify(value);

(async () => {
  const source = connect("mqtt://192.168.1.184", {
    clientId: "victron-influx-bridge",
  });
  let instanceId = undefined;

  source.on("connect", () => {
    console.log("MQTT connected");
    instanceId = undefined;
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
  source.on(
    "message",
    async (topic, message, { qos, retain, dup, properties }) => {
      console.log(
        `${topic} ${message.byteLength} bytes: ${message.toString()}`
      );

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

      if (topic.startsWith("N/") && message.byteLength > 0) {
        const topicRewrite = topic.slice(3 + instanceId.length);

        const influxLines = [];
        try {
          const messageBody = JSON.parse(message.toString());

          if (messageBody.value != null && topicRewrite !== "keepalive") {
            const ts = (Date.now() * 1000000).toFixed(0);
            const valueEscaped = escapeValue(messageBody.value);

            influxLines.push(
              `victron12 ${escapeKey(topicRewrite)}=${valueEscaped} ${ts}`
            );

            if (mapping[topicRewrite] != null) {
              influxLines.push(
                `flat ${escapeKey(mapping[topicRewrite])}=${valueEscaped} ${ts}`
              );
            }
          }
        } catch (ex) {
          console.warn("error parsing", ex);
        }

        try {
          if (influxLines.length > 0) {
            udpClient.send(influxLines.join("\r\n"), 8094, "127.0.0.1");
            for (const line of influxLines) {
              console.log(line);
            }
          }
        } catch (ex) {
          console.warn("error sending", ex);
        }
      }
    }
  );

  source.on("close", () => {
    console.log("MQTT closed");
    if (keepaliveInterval != null) {
      clearInterval(keepaliveInterval);
    }

    // source.reconnect();
  });

  source.on("error", (err) => {
    console.log("MQTT error", err);
  });

  source.on("disconnect", () => {
    console.log("MQTT disconnect");
  });

  source.on("reconnect", () => {
    console.log("MQTT reconnect");
  });
})();
