import {
  entries,
  flatMap,
  groupBy,
  isEqual,
  keyBy,
  mapValues,
  toPairs,
} from "lodash";
import { PointProcessor, RawPoint } from "./types";
import toml from "toml";
import fs from "fs";

type MappingSpec = {
  measurement: string;
  matchField: string | RegExp;
  matchTags?: { [key: string]: string | RegExp };
  destinationField: string | ((match: RegExpMatchArray) => string);
  factor?: number;
  destinationTags?: { [key: string]: string };
};

const specsFromToml = (object): MappingSpec[] =>
  flatMap(toPairs(object), ([measurement, specs]) =>
    toPairs(specs as Record<string, any>).map(([matchField, spec]) => {
      if (typeof spec === "string") {
        return { measurement, matchField, destinationField: spec };
      } else {
        return {
          measurement,
          matchField: matchField.startsWith("/")
            ? new RegExp(matchField)
            : matchField,
          ...spec,
        };
      }
    })
  );

const buildMappingTree = (mapping: MappingSpec[]) =>
  mapValues(
    groupBy(mapping, (spec) => spec.measurement),
    (specs) => {
      const exactMatchSpecs = keyBy(
        specs.filter((spec) => typeof spec.matchField === "string"),
        (spec) => spec.matchField as string
      );
      const regexMatchSpecs = specs.filter(
        (spec) => typeof spec.matchField !== "string"
      );

      return {
        exactMatchSpecs,
        regexMatchSpecs,
      };
    }
  );

export class Mapper implements PointProcessor {
  private filePath: string;

  private lastFileContent: any | undefined;

  private mappings: ReturnType<typeof buildMappingTree> | undefined;

  public constructor(filePath: string) {
    this.filePath = filePath;

    this.readMapping().then(async () => {
      for await (const e of fs.promises.watch(this.filePath)) {
        if (await this.readMapping()) {
          console.log("Mapping file changed, reloaded");
        }
      }
    });
  }

  private async readMapping() {
    const data = await fs.promises.readFile(this.filePath, "utf-8");
    const fileContent = toml.parse(data);
    if (isEqual(this.lastFileContent, fileContent)) {
      return false;
    }
    this.mappings = buildMappingTree(specsFromToml(fileContent));
    this.lastFileContent = fileContent;
    // console.log(JSON.stringify(this.mappings, null, 2));
    return true;
  }

  public process(points: RawPoint[]): RawPoint[] {
    return flatMap(points, (point) => {
      return [point, ...this.mapPoint(point)];
    });
  }

  private mapPoint(point: RawPoint): RawPoint[] {
    const { measurement, tags } = point;

    const measurementSpecs = this.mappings?.[measurement];
    if (measurementSpecs == null) {
      return [];
    }

    let outFields: Record<string, number | string> | undefined;
    let outTags: { [key: string]: string } | undefined;

    for (const [fieldName, fieldValue] of entries(point.fields)) {
      let spec: MappingSpec | undefined;
      let match: RegExpMatchArray | undefined;
      if (measurementSpecs.exactMatchSpecs[fieldName] != null) {
        spec = measurementSpecs.exactMatchSpecs[fieldName];
      } else {
        for (const s of measurementSpecs.regexMatchSpecs) {
          match = fieldName.match(s.matchField) ?? undefined;
          if (match != null) {
            spec = s;
            break;
          }
        }
      }

      if (spec?.matchTags != null) {
        for (const [t, v] of entries(spec.matchTags)) {
          if (tags?.[t] !== v) {
            console.log(
              `Tag ${t} does not match ${JSON.stringify(
                v
              )} - is ${JSON.stringify(tags?.[t])} instead`
            );
            spec = undefined;
            break;
          }
        }
      }

      if (spec != null) {
        const destinationField =
          typeof spec.destinationField === "string"
            ? spec.destinationField
            : spec.destinationField(match!);

        const destinationValue =
          spec.factor != null && typeof fieldValue === "number"
            ? fieldValue * spec.factor
            : fieldValue;

        if (outFields == null) {
          outFields = {};
        }
        outFields[destinationField] = destinationValue;

        if (spec.destinationTags != null) {
          outTags = { ...outTags, ...spec.destinationTags };
        }
      }
    }

    if (outFields != null) {
      return [
        {
          measurement: "named",
          timestamp: point.timestamp,
          fields: outFields,
          tags: outTags,
        },
      ];
    }

    return [];
  }
}
