import CDP from "chrome-remote-interface";

type PageContext = {
	cdpPort: number;
	loggerStdout: {
		waitFor: (text: string) => Promise<void>;
	};
};

const connectCdp = CDP;
const getCdpVersion = CDP.Version;

const cdpConnectionOptions = (cdpPort: number): { host: string; port: number } => ({
	host: "127.0.0.1",
	port: cdpPort,
});

const connectBrowser = async (cdpPort: number): Promise<CDP.Client> => {
	const connectionOptions = cdpConnectionOptions(cdpPort);
	const version = await getCdpVersion(connectionOptions);
	return await connectCdp({
		...connectionOptions,
		target: version.webSocketDebuggerUrl,
	});
};

const openNewPage = async (context: PageContext, url: string): Promise<void> => {
	const client = await connectBrowser(context.cdpPort);
	try {
		const { targetId } = await client.Target.createTarget({ url: "about:blank" });
		await context.loggerStdout.waitFor(`id=${targetId}`);
		const { sessionId } = await client.Target.attachToTarget({ flatten: true, targetId });
		await client.send("Page.navigate", { url }, sessionId);
	} finally {
		await client.close();
	}
};

const requestBrowserClose = async (cdpPort: number): Promise<void> => {
	const client = await connectBrowser(cdpPort);
	try {
		await client.Browser.close();
	} finally {
		await client.close().catch(() => undefined);
	}
};

export { requestBrowserClose };
export default openNewPage;
