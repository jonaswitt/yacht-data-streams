import { Output, RawPoint } from "./types";

type FiltersInput = {
  namepass?: string | string[];
};

type Filters = {
  namepass?: string[];
};

export class FilterOutput implements Output {
  private output: Output;

  private filter: Filters;

  public constructor(output: Output, filter: FiltersInput) {
    this.output = output;
    this.filter = {
      namepass:
        Array.isArray(filter.namepass) || filter.namepass == null
          ? filter.namepass
          : [filter.namepass],
    };
  }

  public async write(point: RawPoint) {
    if (
      this.filter.namepass != null &&
      !this.filter.namepass.some((name) => point.measurement.includes(name))
    ) {
      return false;
    }

    return this.output.write(point);
  }
}
