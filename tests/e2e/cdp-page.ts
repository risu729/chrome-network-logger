import CDP from "chrome-remote-interface";
import { targetAttachedLogPrefix } from "kuebiko";

type PageContext = {
	cdpPort: number;
	loggerStdout: {
		waitFor: (text: string) => Promise<void>;
	};
};

const connectCdp = CDP;
const createCdpTarget = CDP.New;
const getCdpVersion = CDP.Version;

const cdpConnectionOptions = (cdpPort: number): { host: string; port: number } => ({
	host: "127.0.0.1",
	port: cdpPort,
});

const navigatePage = async (cdpPort: number, target: CDP.Target, url: string): Promise<void> => {
	const client = await connectCdp({ ...cdpConnectionOptions(cdpPort), target });
	try {
		await client.Page.navigate({ url });
	} finally {
		await client.close();
	}
};

const openNewPage = async (context: PageContext, url: string): Promise<void> => {
	const target = await createCdpTarget({
		...cdpConnectionOptions(context.cdpPort),
		url: "about:blank",
	});
	await context.loggerStdout.waitFor(
		`${targetAttachedLogPrefix({ targetId: target.id, type: target.type })} session=`,
	);
	await navigatePage(context.cdpPort, target, url);
};

const requestBrowserClose = async (cdpPort: number): Promise<void> => {
	const connectionOptions = cdpConnectionOptions(cdpPort);
	const version = await getCdpVersion(connectionOptions);
	const client = await connectCdp({
		...connectionOptions,
		target: version.webSocketDebuggerUrl,
	});
	try {
		await client.Browser.close();
	} finally {
		await client.close().catch(() => undefined);
	}
};

export { requestBrowserClose };
export default openNewPage;
