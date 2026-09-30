import type { INodeExecutionData } from 'n8n-workflow';

import { FashionCloud } from '../../nodes/FashionCloud/FashionCloud.node';
import { type ApiCall, createExecuteContext } from './context';

type RunOptions = Parameters<typeof createExecuteContext>[0];

/** Executes the node once and returns its single output plus all API calls made */
export async function runNode(
	options: RunOptions,
): Promise<{ output: INodeExecutionData[]; calls: ApiCall[] }> {
	const { context, calls } = createExecuteContext(options);
	const [output] = await new FashionCloud().execute.call(context);
	return { output, calls };
}

/** Executes the node expecting it to fail; returns the error and the API calls made */
export async function runNodeExpectingError(options: RunOptions): Promise<{
	error: Error & { description?: string | null; context?: Record<string, unknown> };
	calls: ApiCall[];
}> {
	const { context, calls } = createExecuteContext(options);
	try {
		await new FashionCloud().execute.call(context);
	} catch (error) {
		return { error: error as Error, calls };
	}
	throw new Error('Expected the node to throw');
}
