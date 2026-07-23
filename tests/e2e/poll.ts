type WaitState = {
	deadline: number;
	lastError?: unknown;
	signal?: AbortSignal | undefined;
};

type WaitOptions = {
	deadline?: number | undefined;
	signal?: AbortSignal | undefined;
};

const assertWaitActive = (description: string, state: WaitState): void => {
	if (state.signal?.aborted) {
		throw state.signal.reason ?? new Error(`Stopped waiting for ${description}`);
	}
	if (Date.now() >= state.deadline) {
		throw new Error(`Timed out waiting for ${description}`, { cause: state.lastError });
	}
};

const waitForState = async <T>(
	description: string,
	read: () => Promise<T | undefined>,
	state: WaitState,
): Promise<T> => {
	assertWaitActive(description, state);

	try {
		const result = await read();
		if (result !== undefined) {
			return result;
		}
	} catch (error) {
		await Bun.sleep(250);
		return await waitForState(description, read, { ...state, lastError: error });
	}

	await Bun.sleep(250);
	return await waitForState(description, read, state);
};

const waitFor = async <T>(
	description: string,
	read: () => Promise<T | undefined>,
	options: WaitOptions = {},
): Promise<T> =>
	await waitForState(description, read, {
		deadline: options.deadline ?? Date.now() + 15_000,
		signal: options.signal,
	});

export default waitFor;
