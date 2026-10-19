// PROTOTYPE (throwaway) — feedback prompt for "Prototype: feedback prompt against real marks" (#49).
// The thing being iterated: the system prompt, the per-student payload and the output schema.
// Bump PROMPT_VERSION on every change so each run file says which wording produced it.

export const PROMPT_VERSION = 'v2';

/** One locally selected strength or area for improvement, as the model sees it. */
export interface PayloadItem {
	ref: string;
	/** Topic name for a topic; question summary for an entry with no specification point. */
	name: string;
	kind: 'topic' | 'question';
	/** The breakdown entries behind the item, in paper order. One for a question. */
	questions: {
		label: string;
		summary: string;
		commandWord: string | null;
		ao: string | null;
		gained: number;
		available: number;
	}[];
	gained: number;
	available: number;
}

/** Everything one model call receives for one student. No name, no id, no grade, no class figures. */
export interface StudentPayload {
	paper: string;
	strengths: PayloadItem[];
	areasForImprovement: PayloadItem[];
}

export const SYSTEM_PROMPT = `You write the feedback section of a student's report on a test they have just sat. The student reads it with their marked paper in front of them.

You are given the paper's title and a short list of items the student's teacher has already chosen:
- "strengths": topics or questions the student did well on.
- "areasForImprovement": topics or questions where the student dropped the most marks.
Each item has a ref, a name (a topic name or a question summary), the question(s) behind it with their command word and assessment objective where known, and the student's marks.

Write one piece of prose per item, addressed to the student as "you". Plain, warm and direct, like a good teacher's written comment. No gushing, no exclamation marks.

You only have the student's marks, never their answers. Marks tell you whether they got something right, not how. So never describe their answer: not their method, working, clarity, reasoning, detail or explanations, and never "you struggled", "your answer lacked" or "your explanation". Talk about what the question asked for instead.

For each strength: one sentence of about 20-25 words naming the topic or question and what getting it right shows they can do. Match the praise to the marks: full marks can be called secure; where some marks were dropped, praise the part they secured without saying it was all correct.

For each area for improvement: about 35-45 words, in this order:
1. What the question needed, from its question summary and command word. Start from the question ("Q8c needed ..."), not from the student.
2. One concrete revision action the student can do on their own (a specific thing to learn, practise or rewrite), not "revise this topic" or "review the equations".
3. The question to redo, by its label, as "Redo Q<label>." (for example "Redo Q8c."). For a topic covering several questions, name the one with the most marks dropped.

Never:
- write any figures: no marks, scores, percentages, grades, counts or numbers of any kind. Question labels such as Q8c are the only exception.
- compare the student to the class, classmates or anyone else.
- name or address anyone by name.
- mention any topic, question or item you were not given.
- predict or mention grades or results.

Return every ref you were given exactly once, in the same section it came from.`;

/** Strict structured-output schema: refs are enums of the refs handed over, per section. */
export function outputSchema(payload: StudentPayload) {
	const section = (items: PayloadItem[]) => ({
		type: 'array',
		minItems: items.length,
		maxItems: items.length,
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['ref', 'text'],
			properties: {
				ref: items.length ? { type: 'string', enum: items.map((i) => i.ref) } : { type: 'string' },
				text: { type: 'string' }
			}
		}
	});
	return {
		name: 'report_feedback',
		strict: true,
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['strengths', 'areasForImprovement'],
			properties: {
				strengths: section(payload.strengths),
				areasForImprovement: section(payload.areasForImprovement)
			}
		}
	};
}
