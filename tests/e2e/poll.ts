import { setTimeout as sleep } from "node:timers/promises";

type WaitState = {
	deadline: number;
	lastError?: unknown;
	signal?: AbortSignal | undefined;
};

type WaitOptions = {
	deadline?: number | undefined;
	signal?: AbortSignal | undefined;
};

type WaitRead<T> = {
	result: T | undefined;
	state: WaitState;
};

const assertWaitActive = (description: string, state: WaitState): void => {
	if (state.signal?.aborted) {
		throw state.signal.reason ?? new Error(`Stopped waiting for ${description}`);
	}
	if (Date.now() >= state.deadline) {
		throw new Error(`Timed out waiting for ${description}`, { cause: state.lastError });
	}
};

const readWaitValue = async <T>(
	read: () => Promise<T | undefined>,
	state: WaitState,
): Promise<WaitRead<T>> => {
	try {
		return { result: await read(), state };
	} catch (error) {
		return { result: undefined, state: { ...state, lastError: error } };
	}
};

const waitForNextRead = async (state: WaitState): Promise<void> => {
	await sleep(Math.min(250, state.deadline - Date.now()), undefined, {
		signal: state.signal,
	});
};

const waitForState = async <T>(
	description: string,
	read: () => Promise<T | undefined>,
	state: WaitState,
): Promise<T> => {
	assertWaitActive(description, state);
	const { result, state: nextState } = await readWaitValue(read, state);
	assertWaitActive(description, nextState);
	if (result !== undefined) {
		return result;
	}

	await waitForNextRead(nextState);
	return await waitForState(description, read, nextState);
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
