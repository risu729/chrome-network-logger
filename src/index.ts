import { mkdir } from "node:fs/promises";

import { startCdpLogger } from "./cdp";
import {
	DEFAULT_CDP_ENDPOINT,
	TOOL_VERSION,
	cliArgs,
	normalizeArgs,
	parseArgs,
	renderHelp,
} from "./cli";
import { defineConfig } from "./config";
import { createPluginHost } from "./plugins";
import { getDefaultCaptureDirectory } from "./sanitize";
import { createStorage } from "./storage";
import type {
	CliOptions,
	HookEvent,
	HookEventName,
	LoggerConfig,
	LoggerPlugin,
	LoggerPluginConfig,
	PluginContext,
} from "./types";

const waitForShutdown = (): Promise<void> =>
	new Promise((resolve) => {
		process.once("SIGINT", () => resolve());
		process.once("SIGTERM", () => resolve());
	});

const runLogger = async (options: CliOptions): Promise<void> => {
	const out = options.out ?? getDefaultCaptureDirectory();
	await mkdir(out, { recursive: true });
	const storage = await createStorage(out, options.cdp);

	process.stdout.write(`capture_dir=${storage.runDirectory}\n`);
	process.stdout.write(`cdp=${options.cdp}\n`);

	let logger: undefined | Awaited<ReturnType<typeof startCdpLogger>>;
	let plugins: undefined | Awaited<ReturnType<typeof createPluginHost>>;
	try {
		plugins = await createPluginHost({
			configPath: options.config,
			disabled: options.noPlugins,
			storage,
			verbose: options.verbose,
		});
		logger = await startCdpLogger({
			cdp: options.cdp,
			exclude: options.exclude,
			hooks: plugins,
			include: options.include,
			maxBodyBytes: options.maxBodyBytes,
			storage,
			verbose: options.verbose,
		});
		process.stdout.write("logger running; press Ctrl-C to stop\n");
		await Promise.race([waitForShutdown(), logger.closed]);
	} finally {
		await plugins?.stopping();
		await logger?.close().catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		});
		await plugins?.close();
		await storage.close();
	}
};

const main = async (argv = process.argv.slice(2)): Promise<void> => {
	const options = parseArgs(argv);
	if (options.help) {
		process.stdout.write(renderHelp());
		return;
	}
	if (options.version) {
		process.stdout.write(`${TOOL_VERSION}\n`);
		return;
	}

	await runLogger(options);
};

if (import.meta.main) {
	await main();
}

export {
	DEFAULT_CDP_ENDPOINT,
	cliArgs,
	defineConfig,
	main,
	normalizeArgs,
	parseArgs,
	renderHelp,
	runLogger,
};
export type {
	HookEvent,
	HookEventName,
	LoggerConfig,
	LoggerPlugin,
	LoggerPluginConfig,
	PluginContext,
};
