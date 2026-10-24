export interface FatalError {
	code: string | null;
	message: string;
	retryable?: boolean;
}
