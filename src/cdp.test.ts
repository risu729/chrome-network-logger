import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { CdpResponseLogger, createCompletedMetadata } from "./cdp";
import type {
  CompletedResponseMetadata,
  ErrorRecord,
  LoggerStorage,
  RequestState,
  WebSocketFrameRecord,
} from "./types";

class FakeClient extends EventEmitter {
  Network = {
    enable: vi.fn(() => Promise.resolve()),
    getResponseBody: vi.fn(() =>
      Promise.resolve({
        base64Encoded: false,
        body: '{"ok":true}',
      }),
    ),
  };

  Target = {
    attachToTarget: vi.fn(() => Promise.resolve({ sessionId: "session-1" })),
    getTargets: vi.fn(() => Promise.resolve({ targetInfos: [] })),
    setAutoAttach: vi.fn(() => Promise.resolve()),
    setDiscoverTargets: vi.fn(() => Promise.resolve()),
  };

  close = vi.fn(() => Promise.resolve());
}

const createStorage = (): LoggerStorage & {
  errors: ErrorRecord[];
  metadata: CompletedResponseMetadata[];
  websocket: WebSocketFrameRecord[];
} => {
  const metadata: CompletedResponseMetadata[] = [];
  const errors: ErrorRecord[] = [];
  const websocket: WebSocketFrameRecord[] = [];

  return {
    close: vi.fn(() => Promise.resolve()),
    errors,
    metadata,
    recordBody: vi.fn(() =>
      Promise.resolve({
        base64Encoded: false,
        bodyFile: "bodies/body.json",
        bodyLength: 11,
        bodySaved: true,
        bodySha256: "hash",
      }),
    ),
    recordCompletedResponse: vi.fn((record) => {
      metadata.push(record);
      return Promise.resolve();
    }),
    recordError: vi.fn((record) => {
      errors.push(record);
      return Promise.resolve();
    }),
    recordWebSocketFrame: vi.fn((record) => {
      websocket.push(record);
      return Promise.resolve();
    }),
    runDirectory: "/captures/run",
    runTimestamp: "2026-07-06T12:34:56Z",
    websocket,
  };
};

const waitForAsyncEvent = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createCompletedMetadata", () => {
  it("creates one appendable metadata object per response", () => {
    const state: RequestState = {
      loaderId: "loader-1",
      requestHeaders: { accept: "application/json" },
      requestId: "request-1",
      requestMethod: "GET",
      requestUrl: "https://example.test/api",
      response: {
        charset: "",
        connectionId: 1,
        connectionReused: false,
        encodedDataLength: 123,
        fromDiskCache: false,
        headers: { "content-type": "application/json" },
        mimeType: "application/json",
        protocol: "h2",
        remoteIPAddress: "203.0.113.10",
        remotePort: 443,
        securityState: "secure",
        status: 200,
        statusText: "OK",
        url: "https://example.test/api",
      },
      session: {
        sessionId: "session-1",
        targetId: "target-1",
        targetType: "page",
        targetUrl: "https://example.test",
      },
    };

    expect(
      createCompletedMetadata(
        state,
        { encodedDataLength: 123, requestId: "request-1", timestamp: 1 },
        {
          base64Encoded: false,
          bodyFile: "bodies/body.json",
          bodyLength: 11,
          bodySaved: true,
          bodySha256: "hash",
        },
        "2026-07-06T12:34:56Z",
      ),
    ).toMatchObject({
      bodyFile: "bodies/body.json",
      bodySaved: true,
      encodedDataLength: 123,
      mimeType: "application/json",
      requestHeaders: { accept: "application/json" },
      requestId: "request-1",
      requestMethod: "GET",
      responseHeaders: { "content-type": "application/json" },
      runTimestamp: "2026-07-06T12:34:56Z",
      sessionId: "session-1",
      status: 200,
      url: "https://example.test/api",
    });
  });
});

describe("CdpResponseLogger", () => {
  it("captures completed response bodies and metadata", async () => {
    const client = new FakeClient();
    const storage = createStorage();
    const logger = new CdpResponseLogger(client as never, {
      cdp: "http://127.0.0.1:9222",
      storage,
      verbose: false,
    });

    await logger.start();
    client.emit("Target.attachedToTarget", {
      sessionId: "session-1",
      targetInfo: {
        attached: true,
        browserContextId: "context-1",
        canAccessOpener: false,
        targetId: "target-1",
        title: "Example",
        type: "page",
        url: "https://example.test",
      },
      waitingForDebugger: false,
    });
    await waitForAsyncEvent();
    client.emit(
      "Network.requestWillBeSent",
      {
        documentURL: "https://example.test",
        frameId: "frame-1",
        hasUserGesture: false,
        initiator: { type: "other" },
        loaderId: "loader-1",
        request: {
          headers: { accept: "application/json" },
          initialPriority: "High",
          method: "GET",
          mixedContentType: "none",
          referrerPolicy: "strict-origin-when-cross-origin",
          url: "https://example.test/api",
        },
        requestId: "request-1",
        timestamp: 1,
        type: "XHR",
        wallTime: 1,
      },
      "session-1",
    );
    client.emit(
      "Network.responseReceived",
      {
        frameId: "frame-1",
        hasExtraInfo: false,
        loaderId: "loader-1",
        requestId: "request-1",
        response: {
          headers: { "content-type": "application/json" },
          mimeType: "application/json",
          status: 200,
          statusText: "OK",
          url: "https://example.test/api",
        },
        timestamp: 2,
        type: "XHR",
      },
      "session-1",
    );
    client.emit(
      "Network.loadingFinished",
      { encodedDataLength: 123, requestId: "request-1", timestamp: 3 },
      "session-1",
    );
    await waitForAsyncEvent();

    expect(client.Network.enable).toHaveBeenCalledWith(
      { maxResourceBufferSize: 104_857_600, maxTotalBufferSize: 524_288_000 },
      "session-1",
    );
    expect(storage.recordBody).toHaveBeenCalledOnce();
    expect(storage.metadata).toHaveLength(1);
    expect(storage.metadata[0]).toMatchObject({
      bodyFile: "bodies/body.json",
      bodySaved: true,
      requestId: "request-1",
      requestMethod: "GET",
      status: 200,
      url: "https://example.test/api",
    });
  });

  it("records body retrieval failures without crashing", async () => {
    const client = new FakeClient();
    client.Network.getResponseBody.mockRejectedValueOnce(new Error("No resource with given id"));
    const storage = createStorage();
    const logger = new CdpResponseLogger(client as never, {
      cdp: "http://127.0.0.1:9222",
      storage,
      verbose: false,
    });

    await logger.start();
    client.emit("Target.attachedToTarget", {
      sessionId: "session-1",
      targetInfo: {
        attached: true,
        browserContextId: "context-1",
        canAccessOpener: false,
        targetId: "target-1",
        title: "Example",
        type: "page",
        url: "https://example.test",
      },
      waitingForDebugger: false,
    });
    await waitForAsyncEvent();
    client.emit(
      "Network.responseReceived",
      {
        frameId: "frame-1",
        hasExtraInfo: false,
        loaderId: "loader-1",
        requestId: "request-1",
        response: {
          headers: {},
          mimeType: "application/json",
          status: 200,
          statusText: "OK",
          url: "https://example.test/api",
        },
        timestamp: 2,
        type: "XHR",
      },
      "session-1",
    );
    client.emit(
      "Network.loadingFinished",
      { encodedDataLength: 123, requestId: "request-1", timestamp: 3 },
      "session-1",
    );
    await waitForAsyncEvent();

    expect(storage.metadata[0]).toMatchObject({
      bodySaved: false,
      error: "No resource with given id",
      requestId: "request-1",
    });
    expect(storage.errors[0]).toMatchObject({
      error: "No resource with given id",
      event: "Network.getResponseBody",
      requestId: "request-1",
    });
  });
});
