import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Protocol } from "devtools-protocol";

import { createBodyFilename, relativeBodyPath, timestampForFile } from "./sanitize";
import type {
  BodySaveResult,
  CompletedResponseMetadata,
  ErrorRecord,
  LoggerStorage,
  RequestState,
  RunInfo,
  WebSocketFrameRecord,
} from "./types";

type NdjsonWriter = {
  append: (record: unknown) => Promise<void>;
  close: () => Promise<void>;
};

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const createNdjsonWriter = (path: string): NdjsonWriter => {
  const stream = createWriteStream(path, { flags: "a" });
  let pending = Promise.resolve();

  const writeLine = (line: string): Promise<void> =>
    new Promise((resolve, reject) => {
      stream.write(line, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return {
    append: async (record) => {
      pending = pending.then(() => writeLine(`${JSON.stringify(record)}\n`));
      await pending;
    },
    close: async () => {
      await pending.catch(() => undefined);
      await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
};

const bodyToBytes = (body: Protocol.Network.GetResponseBodyResponse): Uint8Array => {
  if (body.base64Encoded) {
    return Buffer.from(body.body, "base64");
  }

  return Buffer.from(body.body, "utf8");
};

const createRunInfo = (
  runDirectory: string,
  cdpEndpoint: string,
  runTimestamp: string,
): RunInfo => ({
  cdpEndpoint,
  createdAt: runTimestamp,
  nodePlatform: process.platform,
  pid: process.pid,
  runDirectory,
  tool: "cdp-response-logger",
  version: "0.0.0",
});

const createStorage = async (
  runDirectory: string,
  cdpEndpoint: string,
  runTimestamp = new Date().toISOString(),
): Promise<LoggerStorage> => {
  const bodiesDirectory = join(runDirectory, "bodies");
  await mkdir(bodiesDirectory, { recursive: true });
  await writeFile(
    join(runDirectory, "run.json"),
    `${JSON.stringify(createRunInfo(runDirectory, cdpEndpoint, runTimestamp), null, "\t")}\n`,
  );

  const metadata = createNdjsonWriter(join(runDirectory, "metadata.ndjson"));
  const errors = createNdjsonWriter(join(runDirectory, "errors.ndjson"));
  const websocket = createNdjsonWriter(join(runDirectory, "websocket.ndjson"));
  let bodyCounter = 0;

  const recordBody = async (
    state: RequestState,
    body: Protocol.Network.GetResponseBodyResponse,
  ): Promise<BodySaveResult & { base64Encoded: boolean }> => {
    try {
      const bytes = bodyToBytes(body);
      const bodySha256 = sha256(bytes);
      bodyCounter += 1;
      const filename = createBodyFilename(
        timestampForFile(),
        bodySha256,
        bodyCounter,
        state.response?.mimeType,
      );
      const bodyPath = join(bodiesDirectory, filename);
      await writeFile(bodyPath, bytes);

      return {
        base64Encoded: body.base64Encoded,
        bodyFile: relativeBodyPath(filename),
        bodyLength: bytes.byteLength,
        bodySaved: true,
        bodySha256,
      };
    } catch (error) {
      return {
        base64Encoded: body.base64Encoded,
        bodySaved: false,
        error: errorMessage(error),
      };
    }
  };

  return {
    close: async () => {
      await Promise.all([metadata.close(), errors.close(), websocket.close()]);
    },
    recordBody,
    recordCompletedResponse: async (record: CompletedResponseMetadata) => {
      await metadata.append(record);
    },
    recordError: async (record: ErrorRecord) => {
      await errors.append(record);
    },
    recordWebSocketFrame: async (frame: WebSocketFrameRecord) => {
      await websocket.append(frame);
    },
    runDirectory,
    runTimestamp,
  };
};

export { bodyToBytes, createNdjsonWriter, createStorage, sha256 };
