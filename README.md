# Chrome CDP Response Logger

Local response-body logger for Windows Chrome Beta. The browser runs on
Windows with a dedicated profile. The logger is written in TypeScript for Bun
and is intended to run on Windows against Chrome's local CDP endpoint.

This project does not use mitmproxy, `SSLKEYLOGFILE`, packet capture, request
interception, login automation, analytics, dashboards, parsers, HAR viewers, or
browser automation.

## What It Saves

Each run writes to:

```text
%LOCALAPPDATA%\ChromeCdpResponseLogger\captures\<run>
```

The run folder contains:

```text
run.json
metadata.ndjson
errors.ndjson
websocket.ndjson
bodies\
requests\
netlog.json
```

CDP is used for request/response metadata, response bodies, and request bodies
that Chrome exposes through passive Network-domain events or
`Network.getRequestPostData`. Chrome NetLog is enabled by the Chrome launcher
for network-stack debugging and is written to `netlog.json` in the same run
folder.

## Persistent Windows Folders

```text
%LOCALAPPDATA%\ChromeCdpResponseLogger
%LOCALAPPDATA%\ChromeCdpResponseLogger\chrome-beta-profile
%LOCALAPPDATA%\ChromeCdpResponseLogger\captures
%LOCALAPPDATA%\ChromeCdpResponseLogger\bin
```

Chrome is launched with the dedicated `chrome-beta-profile` directory. The tool
does not attach to or depend on your default Chrome profile. Log in manually to
sites inside this dedicated Chrome Beta profile.

## WSL Setup

Install mise in WSL, then let mise install the pinned toolchain and project
dependencies:

```sh
mise trust
mise install
mise run check --lint
```

## Build And Deploy From WSL

Build a Windows executable and copy it plus the PowerShell scripts into the
persistent Windows bin folder:

```sh
mise run build-windows-from-wsl
```

The script detects Windows `%LOCALAPPDATA%` through `cmd.exe` and `wslpath`. If
detection fails, set:

```sh
mise run build-windows-from-wsl --windows-user YourWindowsUser
```

The expected executable path is:

```text
%LOCALAPPDATA%\ChromeCdpResponseLogger\bin\cdp-response-logger.exe
```

If Bun cross-compilation from WSL fails, build on Windows instead:

```powershell
mise install
$out = "$env:LOCALAPPDATA\ChromeCdpResponseLogger\bin\cdp-response-logger.exe"
mise run compile --target windows-x64
Copy-Item dist\cdp-response-logger-windows-x64.exe $out
```

You can also run the TypeScript entrypoint directly on Windows with Bun:

```powershell
bun src/index.ts --cdp http://127.0.0.1:9222 --out <capture-dir>
```

## Start Chrome Beta

From PowerShell on Windows:

```powershell
& "$env:LOCALAPPDATA\ChromeCdpResponseLogger\bin\start-chrome-beta-cdp.ps1"
```

The launcher:

- Creates the persistent folders.
- Finds Chrome Beta in standard `Program Files` locations, falling back to
  stable Chrome if Beta is unavailable.
- Creates a timestamped capture directory.
- Starts Chrome with:
  - `--user-data-dir=<persistent chrome-beta-profile dir>`
  - `--remote-debugging-address=127.0.0.1`
  - `--remote-debugging-port=9222`
  - `--log-net-log=<capture dir>\netlog.json`
  - `--net-log-capture-mode=Everything`

It does not use headless mode, `--enable-automation`, `--disable-quic`, request
pausing, or interception.

### Chrome NetLog Warning

Chrome may show this banner after startup:

```text
You are using an unsupported command-line flag: --log-net-log=<path>. Stability
and security will suffer.
```

This is expected when NetLog is enabled from the command line. `--log-net-log`
is the Chromium-documented startup flag for writing a NetLog file, but Chrome's
security warning UI can still flag diagnostic command-line switches as
potentially dangerous.

The warning does not mean that NetLog failed or that Chrome ignored the flag.
Verify capture by checking that `netlog.json` exists and grows in the run
folder. The warning is still meaningful: NetLog captures sensitive network
metadata, and `--net-log-capture-mode=Everything` can include more private
debugging detail than the default browser behavior.

## Run The Logger

In a second PowerShell window:

```powershell
& "$env:LOCALAPPDATA\ChromeCdpResponseLogger\bin\run-logger.ps1"
```

To use the same capture directory printed by the Chrome launcher:

```powershell
$capture = "C:\Users\<you>\AppData\Local\ChromeCdpResponseLogger\captures\<run>"
& "$env:LOCALAPPDATA\ChromeCdpResponseLogger\bin\run-logger.ps1" `
  -CaptureDir $capture
```

Combined Chrome plus logger startup:

```powershell
& "$env:LOCALAPPDATA\ChromeCdpResponseLogger\bin\start-capture.ps1"
```

Then browse manually in Chrome Beta. JSON/API response bodies should appear
under `bodies/`; request payloads that Chrome exposes should appear under
`requests/`:

```text
%LOCALAPPDATA%\ChromeCdpResponseLogger\captures\<run>\bodies
%LOCALAPPDATA%\ChromeCdpResponseLogger\captures\<run>\requests
```

`metadata.ndjson` contains one JSON object per completed response that passed
the filters. When available, the same metadata object links to both saved
request payloads and saved response bodies. Failed body captures are written to
`errors.ndjson` and do not stop the logger.

## CLI

```text
cdp-response-logger [options]

Options:
  --cdp <url>              CDP endpoint (default: http://127.0.0.1:9222)
  --out <capture-dir>      Capture directory
  --verbose                Print verbose status logs
  --include <regex>        Only persist matching response URLs
  --exclude <regex>        Do not persist matching response URLs
  --max-body-bytes <num>   Skip body retrieval above encoded byte length
  --help                   Show help
```

If `--out` is omitted, the logger creates a new timestamped capture folder under
`%LOCALAPPDATA%\ChromeCdpResponseLogger\captures`. When running outside Windows
without `LOCALAPPDATA`, pass `--out` explicitly.

## Development

```sh
mise install
mise run test
mise run check --lint
mise run compile
```

`mise run compile` builds both Linux and Windows Bun executables into `dist/`.
Use `mise run compile --target windows-x64` to build only the Windows binary.

## Known Limitations

- CDP may fail to return bodies for downloads, streaming responses, very large
  responses, redirects, cached responses, service-worker cases, or after
  navigation races.
- CDP may not expose every request payload. `Network.getRequestPostData` can
  fail after navigation races and does not include uploaded files for multipart
  form data.
- `--max-body-bytes` compares against CDP `encodedDataLength`; it is a skip
  guard, not a perfect final decoded-size predictor.
- WebSocket messages are not normal HTTP response bodies. This tool writes
  server-to-browser WebSocket frames to `websocket.ndjson`; it does not write
  client-to-server frames in v1.
- This tool does not parse, analyze, classify, or display responses.
- Logs can contain sensitive data, including private API requests, private API
  responses, submitted form content, and cookies-adjacent content. Treat every
  capture directory as secret.
