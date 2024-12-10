# Yacht Data Streams

![NPM Version](https://img.shields.io/npm/v/yacht-data-streams)

A special-purpose streaming data collection and forwarding tool similar to [Telegraf](https://www.influxdata.com/time-series-platform/telegraf/), with a focus on data sources that may be found on sailing yachts.

## Supported Data Sources

- [Victron Cerbo GX](https://www.victronenergy.com/panel-systems-remote-monitoring/cerbo-gx), via MQTT

- [B&G H5000](https://www.bandg.com/en-gb/bg/series/h5000/), via Websocket (this potentially also supports other B&G products like MFDs using the Navico GoFree web interface)

- [Yacht Device YDWG-02 and YDEN-02](https://www.yachtd.com/products/wifi_gateway.html) via UDP and using [canboat](https://github.com/canboat/canboatjs) to decode NMEA 2000 data

- [Vesper Cortex](http://www.vespermarine.com), via Websocket

## Supported Destinations

- [InfluxDB v2](https://www.influxdata.com/)

- [Grafana Live](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)

- Log to log file (with file rotation) in JSON line format

- Log raw NMEA 2000 data to log file (YDWG-02 and YDEN-02 sources only)

- Websocket server serving data in JSON format

- Send JSON-formatted data via UDP, e.g. for use with [Njord Analytics](https://www.sailnjord.com)

## Value Mapping

All data from configured data sources is written to InfluxDB/Grafana as is. Optionally, supports mapping selected measurement/field/tag combinations to another measurement/field/tag; for example, to define a more user-friendly variable nomenclature on the basis of the relatively technical Victron/NMEA 2000 fields and tags.
