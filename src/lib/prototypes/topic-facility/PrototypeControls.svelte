<!--
	PROTOTYPE (#159) — the free-play panel: which assessment is on screen and
	the pooling rules the maintainer is choosing between (issue 159, questions
	3–6). Not part of any variant. Bottom-left, amber like the switcher so it
	reads as scaffolding. Nothing is stored.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { FIXTURES } from './fixtures.js';
	import { currentFixture, topicPrototype } from './prototype-state.svelte.js';

	const proto = topicPrototype();
	const fixture = $derived(currentFixture());
	let open = $state(true);
</script>

{#if dev}
	<div
		class="fixed bottom-4 left-4 z-50 max-h-[85vh] overflow-y-auto rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg print:hidden"
		data-testid="prototype-controls"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Topic facility rules {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-80 gap-3">
				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium">Assessment</legend>
					{#each FIXTURES as item (item.key)}
						<label class="flex items-center gap-2">
							<input
								type="radio"
								name="fixture"
								value={item.key}
								checked={proto.fixture === item.key}
								onchange={() => (proto.fixture = item.key)}
							/>
							{item.label}
						</label>
					{/each}
					<p class="text-amber-200/80">{fixture.note}</p>
				</fieldset>

				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium"
						>Topics both tiers carry <span class="text-amber-200/80">(question 3)</span></legend
					>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="tierScope"
							value="per-tier"
							checked={proto.rules.tierScope === 'per-tier'}
							onchange={() => (proto.rules.tierScope = 'per-tier')}
						/>
						Each tier on its own
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="tierScope"
							value="pooled"
							checked={proto.rules.tierScope === 'pooled'}
							onchange={() => (proto.rules.tierScope = 'pooled')}
						/>
						Also pooled across both tiers
					</label>
				</fieldset>

				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium"
						>Assessment objectives <span class="text-amber-200/80">(question 4)</span></legend
					>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="aoRows"
							value="mixed"
							checked={proto.rules.aoRows === 'mixed'}
							onchange={() => (proto.rules.aoRows = 'mixed')}
						/>
						In the same list as topics
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="aoRows"
							value="separate"
							checked={proto.rules.aoRows === 'separate'}
							onchange={() => (proto.rules.aoRows = 'separate')}
						/>
						A separate list
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="aoRows"
							value="none"
							checked={proto.rules.aoRows === 'none'}
							onchange={() => (proto.rules.aoRows = 'none')}
						/>
						Left out
					</label>
				</fieldset>

				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium">
						A question with several spec points <span class="text-amber-200/80">(question 5)</span>
					</legend>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="multiSpec"
							value="each"
							checked={proto.rules.multiSpec === 'each'}
							onchange={() => (proto.rules.multiSpec = 'each')}
						/>
						Counts toward each
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="multiSpec"
							value="split"
							checked={proto.rules.multiSpec === 'split'}
							onchange={() => (proto.rules.multiSpec = 'split')}
						/>
						Splits its marks between them
					</label>
					<p class="text-amber-200/80">
						Splitting never shrinks what the question counts toward its objective.
					</p>
				</fieldset>

				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium"
						>Order and unscored topics <span class="text-amber-200/80">(question 6)</span></legend
					>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="order"
							value="weakest"
							checked={proto.rules.order === 'weakest'}
							onchange={() => (proto.rules.order = 'weakest')}
						/>
						Weakest first, unscored last
					</label>
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="order"
							value="paper-switch"
							checked={proto.rules.order === 'paper-switch'}
							onchange={() => (proto.rules.order = 'paper-switch')}
						/>
						Paper order with a sort switch
					</label>
				</fieldset>
			</div>
		{/if}
	</div>
{/if}
