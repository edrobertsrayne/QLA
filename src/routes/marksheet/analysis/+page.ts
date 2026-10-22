/** The entry the analysis was opened at, outlined and scrolled to; an unknown id outlines nothing. */
export function load({ url }: { url: URL }): { entry: string | null } {
	return { entry: url.searchParams.get('entry') };
}
