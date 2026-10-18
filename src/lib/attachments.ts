/** Focus a field as it mounts, caret at the end. */
export function caretAtEnd(node: HTMLInputElement): void {
	node.focus();
	node.setSelectionRange(node.value.length, node.value.length);
}
