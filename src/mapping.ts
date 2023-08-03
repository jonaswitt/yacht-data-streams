import {
  entries,
  flatMap,
  fromPairs,
  groupBy,
  isEqual,
  keyBy,
  mapValues,
  toPairs,
} from "lodash";
import { PointProcessor, RawPoint } from "./types";
import fs from "fs";
import csv from "csv-parser";

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
      const exactMatchSpecs = groupBy(
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
    const fileContent = await new Promise<MappingSpec[]>((resolve) => {
      const results: MappingSpec[] = [];
      fs.createReadStream(this.filePath)
        .pipe(
          csv({
            skipComments: true,
          })
        )
        .on("data", (data) => {
          if (data.measurement == null) {
            return;
          }
          const matchTags = fromPairs(
            entries<string>(data)
              .filter(([key, value]) => key.startsWith("matchTag."))
              .map(([key, value]) => [key.slice(9), value.trim()])
              .filter(([key, value]) => value !== "")
          );
          const outputTags = fromPairs(
            entries<string>(data)
              .filter(([key, value]) => key.startsWith("outputTag."))
              .map(([key, value]) => [key.slice(10), value.trim()])
              .filter(([key, value]) => value !== "")
          );

          results.push({
            measurement: data.measurement,
            matchField: data.matchField,
            matchTags,
            destinationField: data.outputField,
            destinationTags: outputTags,
            factor: data.factor?.trim()?.length
              ? parseFloat(data.factor)
              : undefined,
          });
        })
        .on("end", () => {
          resolve(results);
        });
    });

    if (isEqual(this.lastFileContent, fileContent)) {
      return false;
    }
    this.mappings = buildMappingTree(fileContent);
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
      let specs: MappingSpec[] = [];
      let match: RegExpMatchArray | undefined;
      if (measurementSpecs.exactMatchSpecs[fieldName] != null) {
        specs = measurementSpecs.exactMatchSpecs[fieldName];
      } else {
        for (const s of measurementSpecs.regexMatchSpecs) {
          match = fieldName.match(s.matchField) ?? undefined;
          if (match != null) {
            if (specs == null) {
              specs = [];
            }
            specs.push(s);
            break;
          }
        }
      }

      specs = specs?.filter((spec) => {
        if (spec?.matchTags != null) {
          for (const [t, v] of entries(spec.matchTags)) {
            if (tags?.[t] !== v) {
              // console.log(
              //   `Tag ${t} does not match ${JSON.stringify(
              //     v
              //   )} - is ${JSON.stringify(tags?.[t])} instead`
              // );
              return false;
            }
          }
        }
        return true;
      });

      for (const spec of specs) {
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
