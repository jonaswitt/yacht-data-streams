import { sortBy } from "lodash";
import stream from "stream";

class Sort extends stream.Transform {
  private windowSizeMs: number;
  private chunks: any[] = [];

  constructor(windowSizeMs: number) {
    super({
      objectMode: true,
    });
    this.windowSizeMs = windowSizeMs;
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: stream.TransformCallback
  ): void {
    this.chunks.push(chunk);

    this.pushChunks(
      new Date(
        (chunk.timestampGps || chunk.timestamp).valueOf() - this.windowSizeMs
      )
    );

    callback();
  }

  _final(callback: (error?: Error | null | undefined) => void): void {
    this.pushChunks();
    callback();
  }

  pushChunks(filterTime?: Date) {
    let pushingChunks = this.chunks;
    if (filterTime != null) {
      pushingChunks = pushingChunks.filter(
        (oldChunk) =>
          (oldChunk.timestampGps || oldChunk.timestamp).valueOf() <
          filterTime.valueOf()
      );
    }
    for (const oldChunk of sortBy(pushingChunks, (oldChunk) =>
      (oldChunk.timestampGps || oldChunk.timestamp).valueOf()
    )) {
      this.push(oldChunk);
    }
    if (filterTime != null) {
      this.chunks = this.chunks.filter(
        (oldChunk) => !pushingChunks.includes(oldChunk)
      );
    } else {
      this.chunks = [];
    }
  }
}

export default Sort;
