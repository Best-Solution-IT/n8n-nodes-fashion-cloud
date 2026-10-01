import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
} from 'n8n-workflow';

/** A request as the node sent it to `httpRequestWithAuthentication` */
export interface ApiCall {
	credentialType: string;
	method?: string;
	url: string;
	baseURL?: string;
	qs: IDataObject;
	body?: unknown;
	json?: boolean;
	encoding?: string;
	returnFullResponse?: boolean;
}

/** Answers a request, or throws to simulate an HTTP error (see `apiError`) */
export type ApiHandler = (call: ApiCall) => unknown;

type Params = IDataObject | ((itemIndex: number) => IDataObject);

/** A resource locator value as n8n stores it, e.g. for the brand picker */
export function resourceLocator(value: string, mode = 'list'): IDataObject {
	return { __rl: true, mode, value };
}

/** Decrypted values of the Fashion Cloud credential */
export type Credentials = IDataObject;

const defaultCredentials: Credentials = {
	token: 'test-token',
	baseUrl: 'https://api.fashion.cloud',
};

interface ContextOptions {
	params: Params;
	api: ApiHandler;
	credentials?: Credentials;
	items?: INodeExecutionData[];
	continueOnFail?: boolean;
	timezone?: string;
}

const node: INode = {
	id: 'test-node',
	name: 'Fashion Cloud',
	type: 'CUSTOM.fashionCloud',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * Builds an error shaped like the axios errors n8n's HTTP helpers throw, so the
 * node's error mapping sees the same structure as in production.
 */
export function apiError(status: number, data: unknown): Error {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		response: { status, data },
	});
}

function recordingHelpers(api: ApiHandler, calls: ApiCall[]) {
	return {
		async httpRequestWithAuthentication(credentialType: string, options: IHttpRequestOptions) {
			const call: ApiCall = structuredClone({
				credentialType,
				method: options.method,
				url: options.url,
				baseURL: options.baseURL,
				qs: (options.qs ?? {}) as IDataObject,
				body: options.body,
				json: options.json,
				encoding: options.encoding,
				returnFullResponse: options.returnFullResponse,
			});
			calls.push(call);
			return api(call);
		},
	};
}

/**
 * Minimal stand-in for n8n's IExecuteFunctions. `getNodeParameter` throws for
 * parameters that are neither set nor given a fallback, like n8n does, so tests
 * catch reads of parameters that aren't shown for the current operation.
 */
export function createExecuteContext(options: ContextOptions) {
	const calls: ApiCall[] = [];
	const items = options.items ?? [{ json: {} }];
	const paramsFor = (i: number) =>
		typeof options.params === 'function' ? options.params(i) : options.params;

	const context = {
		getInputData: () => items,
		getNode: () => node,
		getTimezone: () => options.timezone ?? 'Europe/Berlin',
		getCredentials: async () => options.credentials ?? defaultCredentials,
		continueOnFail: () => options.continueOnFail ?? false,
		getNodeParameter(
			name: string,
			itemIndex: number,
			fallback?: unknown,
			{ extractValue = false } = {},
		) {
			// "options.brand" reads a field of a collection, like in n8n
			const path = name.split('.');
			const key = path.pop() as string;
			const parent = path.reduce<IDataObject | undefined>(
				(object, field) => object?.[field] as IDataObject | undefined,
				paramsFor(itemIndex),
			);
			// A parameter set to undefined stands for an expression that resolved to nothing
			if (!parent || !(key in parent)) {
				if (fallback !== undefined) return fallback;
				throw new Error(`Test did not set node parameter "${name}"`);
			}
			const value = parent[key];
			// A resource locator value is { __rl: true, mode, value }
			if (extractValue && typeof value === 'object' && value !== null && '__rl' in value) {
				return (value as IDataObject).value;
			}
			return value;
		},
		helpers: {
			...recordingHelpers(options.api, calls),
			returnJsonArray: (data: IDataObject | IDataObject[]) =>
				(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (
				data: INodeExecutionData[],
				{ itemData }: { itemData: { item: number } },
			) => data.map((entry) => ({ ...entry, pairedItem: itemData })),
			prepareBinaryData: async (buffer: Buffer, fileName: string, mimeType: string) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};

	return { context: context as unknown as IExecuteFunctions, calls };
}

export function createLoadOptionsContext(
	api: ApiHandler,
	credentials: Credentials = defaultCredentials,
) {
	const calls: ApiCall[] = [];
	const context = {
		getNode: () => node,
		getCredentials: async () => credentials,
		helpers: recordingHelpers(api, calls),
	};
	return { context: context as unknown as ILoadOptionsFunctions, calls };
}
