<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import FatalAlert from '$lib/components/parse/FatalAlert.svelte';
	import ResultsCard from '$lib/components/parse/ResultsCard.svelte';
	import SourceFilesCard from '$lib/components/parse/SourceFilesCard.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ModelSelect, { type ModelOption } from '$lib/components/parse/ModelSelect.svelte';
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import type { FatalError, RunResult } from '$lib/components/parse/types.js';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { toast } from 'svelte-sonner';

	// Mirrors the server per-file cap (src/lib/server/parse/schema.ts).
	const MAX_FILE_BYTES = 15 * 1024 * 1024;

	const RETRYABLE_CODES = new Set([
		'MODEL_RETRYABLE',
		'MODEL_ERROR',
		'MALFORMED_MODEL_OUTPUT',
		'REQUEST_FAILED'
	]);

	let assessmentPaper = $state<File | null>(null);
	let markscheme = $state<File | null>(null);
	let paperError = $state<string | null>(null);
	let markschemeError = $state<string | null>(null);
	let modelOverride = $state('');
	let modelCustom = $state(false);
	let modelOptions = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelsError = $state<string | null>(null);
	let modelsSource = $state<'live' | 'fallback' | null>(null);
	let specUrl = $state('');
	let specUrlError = $state<string | null>(null);
	let running = $state(false);
	let result = $state<RunResult | null>(null);
	let fatal = $state<FatalError | null>(null);

	const paperFileName = $derived(assessmentPaper?.name ?? null);
	const markschemeFileName = $derived(markscheme?.name ?? null);

	const breakdownJson = $derived.by(() => {
		const current = result;
		if (!current) return '';
		return JSON.stringify({ breakdown: current.breakdown }, null, 2);
	});

	const fatalIsRetryable = $derived.by(() => {
		const current = fatal;
		if (!current) return false;
		return current.retryable ?? RETRYABLE_CODES.has(current.code);
	});

	const canRun = $derived(
		(assessmentPaper !== null || markscheme !== null) &&
			paperError === null &&
			markschemeError === null &&
			specUrlError === null &&
			!running
	);

	function checkPdf(file: File): string | null {
		const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
		if (!isPdf) return 'Only PDF files are accepted.';
		if (file.size > MAX_FILE_BYTES) return 'File exceeds the 15MB per-file limit.';
		return null;
	}

	function onPaperChange(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0] ?? null;
		paperError = file ? checkPdf(file) : null;
		assessmentPaper = file && !paperError ? file : null;
	}

	function onMarkschemeChange(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0] ?? null;
		markschemeError = file ? checkPdf(file) : null;
		markscheme = file && !markschemeError ? file : null;
	}

	function onSpecUrlInput(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		specUrl = value;
		specUrlError = checkSpecUrl(value);
	}

	function checkSpecUrl(value: string): string | null {
		const trimmed = value.trim();
		if (trimmed === '') return null;
		let url: URL;
		try {
			url = new URL(trimmed);
		} catch {
			return 'Enter a valid http(s) link, or leave this empty.';
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return 'Enter a valid http(s) link, or leave this empty.';
		}
		return null;
	}

	async function loadModels(): Promise<void> {
		modelsLoading = true;
		modelsError = null;
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error(`status ${response.status}`);
			const body = (await response.json()) as {
				models?: ModelOption[];
				source?: 'live' | 'fallback';
			};
			modelOptions = Array.isArray(body.models) ? body.models : [];
			modelsSource = body.source ?? null;
			if (
				!modelCustom &&
				modelOverride !== '' &&
				!modelOptions.some((m) => m.id === modelOverride)
			) {
				modelOverride = '';
			}
		} catch {
			modelsError = 'The model list could not be loaded. Server default still works.';
			modelOptions = [];
			modelsSource = null;
		} finally {
			modelsLoading = false;
		}
	}

	onMount(() => {
		void loadModels();
	});

	async function run(): Promise<void> {
		if (!canRun) return;
		running = true;
		result = null;
		fatal = null;
		try {
			const form = new FormData();
			if (assessmentPaper) form.append('assessmentPaper', assessmentPaper);
			if (markscheme) form.append('markscheme', markscheme);
			if (modelCustom) modelOverride = modelOverride.trim();
			if (modelOverride !== '') form.append('modelOverride', modelOverride);
			if (specUrl.trim() !== '') form.append('specUrl', specUrl.trim());

			const response = await fetch('/api/parse', { method: 'POST', body: form });
			const body = (await response.json()) as RunResult | { error: FatalError };
			if (!response.ok) {
				fatal = (body as { error: FatalError }).error;
				toast.error(`Run failed (${fatal.code})`, { description: fatal.message });
			} else {
				result = body as RunResult;
				toast.success('Breakdown ready', {
					description: `${result.breakdown.questions.length} questions parsed.`
				});
			}
		} catch (error) {
			fatal = {
				code: 'REQUEST_FAILED',
				message: error instanceof Error ? error.message : 'The run could not be completed.'
			};
			toast.error('Run failed (REQUEST_FAILED)', { description: fatal.message });
		} finally {
			running = false;
		}
	}

	async function copyBreakdown(): Promise<void> {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(breakdownJson);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Copy failed', {
				description: 'Select the raw JSON below and copy it manually.'
			});
		}
	}

	function downloadBreakdown(): void {
		if (!result) return;
		const blob = new Blob([breakdownJson], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'breakdown.json';
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		toast.success('Download started', { description: 'breakdown.json' });
	}
</script>

<main class="mx-auto max-w-4xl space-y-6 p-6">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
		<p class="text-sm text-muted-foreground">
			Attach an assessment paper and/or its markscheme PDF, then Run. You get one JSON entry per
			marked question with marks, a short summary, spec point (exact lift or null), command word and
			assessment objective.
		</p>
	</div>

	<Separator />

	<div class="grid gap-6 lg:grid-cols-2">
		<SourceFilesCard
			{paperFileName}
			{markschemeFileName}
			{paperError}
			{markschemeError}
			{onPaperChange}
			{onMarkschemeChange}
		/>
		<Card.Root class="overflow-visible">
			<Card.Header>
				<Card.Title>Options</Card.Title>
				<Card.Description
					>Pick a curated model with native PDF parsing, or choose Custom for any OpenRouter model
					id.</Card.Description
				>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label>Model override (optional)</Label>
					<ModelSelect
						bind:value={modelOverride}
						bind:custom={modelCustom}
						models={modelOptions}
						loading={modelsLoading}
						loadError={modelsError}
						source={modelsSource}
						onretry={() => void loadModels()}
					/>
				</div>
				<div class="space-y-2">
					<Label for="spec">Specification link (optional)</Label>
					<Input
						id="spec"
						type="url"
						inputmode="url"
						placeholder="https://…/specification.pdf"
						value={specUrl}
						aria-invalid={specUrlError !== null}
						oninput={onSpecUrlInput}
					/>
					{#if specUrlError}
						<p class="text-sm text-destructive">{specUrlError}</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							Link to the exam board specification PDF. It is fetched for this run only and must be
							a readable PDF.
						</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	</div>

	<div>
		<Button type="button" size="lg" disabled={!canRun} onclick={run}>
			{#if running}
				<Loader2Icon class="animate-spin" />Running…
			{:else}
				Run
			{/if}
		</Button>
	</div>

	{#if fatal}
		<FatalAlert {fatal} retryable={fatalIsRetryable} />
	{/if}

	{#if result}
		<ResultsCard
			{result}
			{breakdownJson}
			{running}
			onCopy={copyBreakdown}
			onDownload={downloadBreakdown}
		/>
	{/if}
</main>
