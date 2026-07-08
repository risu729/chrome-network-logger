import CDP from "chrome-remote-interface";

type BrowserProcess = ReturnType<typeof Bun.spawn>;

type BrowserVersion = {
	webSocketDebuggerUrl?: string | undefined;
};

type BrowserLaunchOptions = {
	browserCommand?: string | undefined;
	browserPath?: string | undefined;
	cdpPort: number;
	netLogPath?: string | undefined;
	profileDirectory: string;
	verbose: boolean;
};

type StartedBrowser = {
	cdpEndpoint: string;
	close: () => Promise<void>;
};

const CDP_READY_TIMEOUT_MS = 15_000;
const CDP_READY_POLL_MS = 100;
const connectCdp = CDP;
const getCdpVersion = CDP.Version;

const createCdpEndpoint = (port: number): string => `http://127.0.0.1:${port}`;

const getBrowserExecutable = (options: BrowserLaunchOptions): string => {
	const executable = options.browserPath ?? options.browserCommand;
	if (!executable) {
		throw new Error("--launch-browser requires --browser-command or --browser-path.");
	}

	return executable;
};

const buildBrowserArgs = (options: BrowserLaunchOptions): string[] => {
	const args = [
		`--user-data-dir=${options.profileDirectory}`,
		"--remote-debugging-address=127.0.0.1",
		`--remote-debugging-port=${options.cdpPort}`,
	];

	if (options.netLogPath) {
		args.push(`--log-net-log=${options.netLogPath}`, "--net-log-capture-mode=Everything");
	}

	return args;
};

const fetchBrowserVersion = async (cdpEndpoint: string): Promise<BrowserVersion> => {
	const response = await fetch(`${cdpEndpoint}/json/version`);
	if (!response.ok) {
		throw new Error(`CDP version endpoint returned ${response.status}.`);
	}

	return (await response.json()) as BrowserVersion;
};

const waitForCdp = async (
	cdpEndpoint: string,
	deadline = Date.now() + CDP_READY_TIMEOUT_MS,
): Promise<void> => {
	try {
		await fetchBrowserVersion(cdpEndpoint);
	} catch (error) {
		if (Date.now() >= deadline) {
			throw new Error(`Browser did not expose CDP at ${cdpEndpoint}.`, { cause: error });
		}
		await Bun.sleep(CDP_READY_POLL_MS);
		await waitForCdp(cdpEndpoint, deadline);
	}
};

const closeThroughCdp = async (cdpEndpoint: string): Promise<void> => {
	const endpoint = new URL(cdpEndpoint);
	const connectionOptions = {
		host: endpoint.hostname,
		port: Number(endpoint.port),
	};
	const version = await getCdpVersion(connectionOptions);
	const client = await connectCdp({ ...connectionOptions, target: version.webSocketDebuggerUrl });
	await client.Browser.close();
};

const waitForExit = async (browser: BrowserProcess): Promise<void> => {
	await browser.exited.catch(() => undefined);
};

const closeBrowser = async (browser: BrowserProcess, cdpEndpoint: string): Promise<void> => {
	try {
		await closeThroughCdp(cdpEndpoint);
	} catch {
		browser.kill("SIGTERM");
	}

	await waitForExit(browser);
};

const startBrowser = async (options: BrowserLaunchOptions): Promise<StartedBrowser> => {
	const executable = getBrowserExecutable(options);
	const args = buildBrowserArgs(options);
	const browser = Bun.spawn([executable, ...args], {
		stderr: options.verbose ? "inherit" : "ignore",
		stdout: options.verbose ? "inherit" : "ignore",
	});
	const cdpEndpoint = createCdpEndpoint(options.cdpPort);
	await waitForCdp(cdpEndpoint);

	return {
		cdpEndpoint,
		close: async () => {
			await closeBrowser(browser, cdpEndpoint);
		},
	};
};

export { buildBrowserArgs, createCdpEndpoint, startBrowser };
export type { BrowserLaunchOptions, StartedBrowser };
