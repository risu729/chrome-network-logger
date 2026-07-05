import type { Protocol } from "devtools-protocol";

type CliOptions = {
  cdp: string;
  exclude?: RegExp | undefined;
  help: boolean;
  include?: RegExp | undefined;
  maxBodyBytes?: number | undefined;
  out?: string | undefined;
  verbose: boolean;
};

type RunInfo = {
  cdpEndpoint: string;
  createdAt: string;
  nodePlatform: NodeJS.Platform;
  pid: number;
  runDirectory: string;
  tool: string;
  version: string;
};

type SessionInfo = {
  sessionId: string;
  targetId?: string | undefined;
  targetType?: string | undefined;
  targetUrl?: string | undefined;
};

type RequestState = {
  frameId?: string | undefined;
  initiator?: Protocol.Network.Initiator | undefined;
  loaderId?: string | undefined;
  requestHeaders?: Protocol.Network.Headers | undefined;
  requestId: Protocol.Network.RequestId;
  requestMethod?: string | undefined;
  requestTime?: string | undefined;
  requestUrl?: string | undefined;
  response?: Protocol.Network.Response | undefined;
  session: SessionInfo;
  type?: Protocol.Network.ResourceType | undefined;
};

type BodySaveResult = {
  bodyFile?: string | undefined;
  bodyLength?: number | undefined;
  bodySaved: boolean;
  bodySha256?: string | undefined;
  error?: string | undefined;
  skipped?: boolean | undefined;
};

type CompletedResponseMetadata = {
  base64Encoded?: boolean | undefined;
  bodyFile?: string | undefined;
  bodyLength?: number | undefined;
  bodySaved: boolean;
  bodySha256?: string | undefined;
  encodedDataLength?: number | undefined;
  error?: string | undefined;
  fromDiskCache?: boolean | undefined;
  fromPrefetchCache?: boolean | undefined;
  fromServiceWorker?: boolean | undefined;
  loaderId?: string | undefined;
  mimeType?: string | undefined;
  protocol?: string | undefined;
  remoteIPAddress?: string | undefined;
  remotePort?: number | undefined;
  requestHeaders?: Protocol.Network.Headers | undefined;
  requestId: string;
  requestMethod?: string | undefined;
  responseHeaders?: Protocol.Network.Headers | undefined;
  runTimestamp: string;
  sessionId: string;
  status?: number | undefined;
  statusText?: string | undefined;
  tabTargetId?: string | undefined;
  targetType?: string | undefined;
  targetUrl?: string | undefined;
  type?: string | undefined;
  url?: string | undefined;
};

type ErrorRecord = {
  error: string;
  event: string;
  requestId?: string | undefined;
  sessionId?: string | undefined;
  targetId?: string | undefined;
  timestamp: string;
  url?: string | undefined;
};

type WebSocketFrameRecord = {
  direction: "received";
  opcode: number;
  payloadData: string;
  requestId: string;
  sessionId: string;
  targetId?: string | undefined;
  timestamp: string;
  url?: string | undefined;
};

type LoggerStorage = {
  close: () => Promise<void>;
  recordBody: (
    state: RequestState,
    body: Protocol.Network.GetResponseBodyResponse,
  ) => Promise<BodySaveResult & { base64Encoded: boolean }>;
  recordCompletedResponse: (metadata: CompletedResponseMetadata) => Promise<void>;
  recordError: (error: ErrorRecord) => Promise<void>;
  recordWebSocketFrame: (frame: WebSocketFrameRecord) => Promise<void>;
  runDirectory: string;
  runTimestamp: string;
};

type StartLoggerOptions = {
  cdp: string;
  exclude?: RegExp | undefined;
  include?: RegExp | undefined;
  maxBodyBytes?: number | undefined;
  storage: LoggerStorage;
  verbose: boolean;
};

export type {
  BodySaveResult,
  CliOptions,
  CompletedResponseMetadata,
  ErrorRecord,
  LoggerStorage,
  RequestState,
  RunInfo,
  SessionInfo,
  StartLoggerOptions,
  WebSocketFrameRecord,
};
