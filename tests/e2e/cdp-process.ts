import { requestBrowserClose } from "./cdp-page";

type BrowserProcess = ReturnType<typeof Bun.spawn>;

const BROWSER_CLOSE_REQUEST_TIMEOUT_MS = 1_000;
const BROWSER_STOP_TIMEOUT_MS = 3_000;
const PROCESS_STOP_TIMEOUT_MS = 2_000;

const waitForProcessExit = async (
	process: ReturnType<typeof Bun.spawn>,
	timeout = PROCESS_STOP_TIMEOUT_MS,
): Promise<boolean> =>
	await Promise.race([process.exited.then(() => true), Bun.sleep(timeout).then(() => false)]);

const stopProcess = async (process: ReturnType<typeof Bun.spawn>): Promise<void> => {
	if (process.exitCode !== null) {
		await process.exited;
		return;
	}

	process.kill("SIGTERM");
	if (await waitForProcessExit(process)) {
		return;
	}

	process.kill("SIGKILL");
	await process.exited;
};

const settle = async (work: Promise<unknown>): Promise<void> => {
	await work.catch(() => undefined);
};

const remainingTimeout = (deadline: number): number => Math.max(0, deadline - Date.now());

const stopBrowser = async (browser: BrowserProcess, cdpPort: number): Promise<void> => {
	if (browser.exitCode !== null) {
		await browser.exited;
		return;
	}

	const deadline = Date.now() + BROWSER_STOP_TIMEOUT_MS;
	await Promise.race([
		settle(requestBrowserClose(cdpPort)),
		Bun.sleep(BROWSER_CLOSE_REQUEST_TIMEOUT_MS),
	]);
	if (await waitForProcessExit(browser, remainingTimeout(deadline))) {
		return;
	}

	browser.kill("SIGKILL");
	await browser.exited;
};

export { stopBrowser, stopProcess, waitForProcessExit };
export type { BrowserProcess };
