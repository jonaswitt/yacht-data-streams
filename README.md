# Yacht Data Streams

A special-purpose streaming data collection and forwarding tool similar to [Telegraf](https://www.influxdata.com/time-series-platform/telegraf/), with a focus on data sources that may be found on sailing yachts.

## Supported Data Sources

- [Victron Cerbo GX](https://www.victronenergy.com/panel-systems-remote-monitoring/cerbo-gx), via MQTT

- [B&G H5000](https://www.bandg.com/en-gb/bg/series/h5000/), via Websocket (this potentially also supports other B&G products like MFDs using the Navico GoFree web interface)

- [Yacht Device YDWG-02 and YDEN-02](https://www.yachtd.com/products/wifi_gateway.html) via UDP and using [canboat](https://github.com/canboat/canboatjs) to decode NMEA 2000 data

## Supported Destinations

- [InfluxDB v2](https://www.influxdata.com/)

- [Grafana Live](https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/)

## Value Mapping

All data from configured data sources is written to InfluxDB/Grafana as is. Optionally, supports mapping selected measurement/field/tag combinations to another measurement/field/tag; for example, to define a more user-friendly variable nomenclature on the basis of the relatively technical Victron/NMEA 2000 fields and tags.

## Logging

Supports logging of all received YDWG-02 / YDEN-02 data to text file (with log rotation), for debugging/analysis purposes.
