import stream from "stream";

class RealtimePlayback extends stream.Transform {
  private timeOffset: number | undefined;
  private resetTime: boolean;
  constructor(options?: { resetTime?: boolean }) {
    super({ objectMode: true });

    this.resetTime = options?.resetTime ?? false;
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    const chunkTime = chunk.timestampGps || chunk.timestamp;

    if (this.timeOffset == null) {
      this.timeOffset = Date.now() - chunkTime.valueOf();
      this.push(
        this.resetTime
          ? {
              ...chunk,
              timestampGps: undefined,
              timestamp: new Date(),
            }
          : chunk
      );
      callback();
    } else {
      const playtime = chunkTime.valueOf() + this.timeOffset;
      setTimeout(() => {
        this.push(
          this.resetTime
            ? {
                ...chunk,
                timestampGps: undefined,
                timestamp: new Date(),
              }
            : chunk
        );
        callback();
      }, Math.max(playtime - Date.now(), 0));
    }
  }
}

export default RealtimePlayback;
