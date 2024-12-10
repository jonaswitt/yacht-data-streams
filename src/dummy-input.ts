import { RawPoint } from "./types";

export class DummyInput {
  private interval: ReturnType<typeof setInterval> | undefined;

  public onPoint: ((point: RawPoint) => void) | undefined;

  public constructor({
    measurement = "dummy",
    instance,
  }: {
    measurement?: string;
    instance?: string;
  }) {
    this.interval = setInterval(() => {
      this.onPoint({
        measurement,
        fields: {
          random: Math.random(),
          fixed: 1,
          zero: 0,
        },
        tags: {
          instance,
        },
      });
    }, 1000);
  }

  public close() {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}
