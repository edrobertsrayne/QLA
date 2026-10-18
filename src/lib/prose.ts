/** A counted noun: `1 mark`, `612 marks`, `2 entries` given its plural. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
	return `${n} ${n === 1 ? noun : plural}`;
}

/** The word that agrees with a count: `is`/`are`, `was`/`were`. */
export function agree(n: number, one: string, many: string): string {
	return n === 1 ? one : many;
}
