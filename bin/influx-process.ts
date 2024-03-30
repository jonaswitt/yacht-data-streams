import fs from "fs";
import lineToJson from "influx-line-protocol-parser";
import { fromPairs, toPairs } from "lodash";

(async () => {
  for (const file of process.argv.slice(2)) {
    const body = await fs.promises.readFile(file, "utf8");

    const lines = body.split("\n");

    const points = lines
      .map((l) => lineToJson(l) as any)
      .filter((p) => p.measurement === "named");

    for (const point of points) {
      const timestamp = new Date(point.timestamp / 1000000);

      let fields = point.fields.reduce(
        (acc, field) => ({ ...acc, ...field }),
        {}
      );
      const tags = point.tags.reduce((acc, tag) => ({ ...acc, ...tag }), {});

      if (tags.instance != null) {
        fields = fromPairs(
          toPairs(fields).map(([key, value]) => [
            `${key}_${tags.instance}`,
            value,
          ])
        );
      }

      console.log(JSON.stringify({ t: timestamp.valueOf() / 1000, r: fields }));
    }
  }

  //
})();
