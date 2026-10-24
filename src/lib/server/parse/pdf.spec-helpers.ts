// Synthetic multi-page PDFs for the parse and match contract tests.

export function buildPdfBytes(pages: string[]): Uint8Array {
	const enc = new TextEncoder();
	let out = '%PDF-1.4\n';
	const offsets: number[] = [0];
	const count = pages.length;
	const pageIds: number[] = [];
	const contentIds: number[] = [];
	for (let i = 0; i < count; i++) {
		pageIds.push(3 + i * 2);
		contentIds.push(4 + i * 2);
	}
	const fontId = 3 + count * 2;
	const objects: string[] = [];
	objects.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
	objects.push(
		`2 0 obj<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${count}>>endobj\n`
	);
	for (let i = 0; i < count; i++) {
		objects.push(
			`${pageIds[i]} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentIds[i]} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>endobj\n`
		);
		const safe = pages[i].replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
		const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
		objects.push(
			`${contentIds[i]} 0 obj<</Length ${enc.encode(stream).length}>>stream\n${stream}\nendstream\nendobj\n`
		);
	}
	objects.push(`${fontId} 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`);
	for (const obj of objects) {
		offsets.push(enc.encode(out).length);
		out += obj;
	}
	const xrefPos = enc.encode(out).length;
	const total = fontId + 1;
	out += `xref\n0 ${total}\n0000000000 65535 f \n`;
	for (let i = 1; i < total; i++) {
		out += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
	}
	out += `trailer<</Size ${total}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
	return enc.encode(out);
}
