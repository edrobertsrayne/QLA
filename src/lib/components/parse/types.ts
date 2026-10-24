export interface FatalError {
	code: string;
	message: string;
	retryable?: boolean;
}
