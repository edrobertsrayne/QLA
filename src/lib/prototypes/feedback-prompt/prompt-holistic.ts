// PROTOTYPE (throwaway) — holistic feedback variant for #49 (v3+).
// The model sees the whole paper's marks for one student and chooses the themes itself; the app
// still owns every figure and checks the choice against the guard-rails from #48 (never red as a
// strength, only dropped-mark questions as an area, at most 3 / 2).

export const HOLISTIC_VERSION = 'v5';

export interface HolisticQuestion {
	label: string;
	summary: string;
	commandWord: string | null;
	ao: string | null;
	/** Topic names this question counts toward; empty when it has no specification point. */
	topics: string[];
	gained: number;
	available: number;
}

export interface HolisticPayload {
	paper: string;
	questions: HolisticQuestion[];
	/** Roll-up by topic name, calculated locally. Empty on a paper with no specification points. */
	topics: { name: string; gained: number; available: number }[];
}

export const HOLISTIC_PROMPT = `You write the feedback section of a student's report on a test they have just sat. The student reads it with their marked paper and a question-by-question table of their marks in front of them, so do not repeat that table: your job is to see the patterns in it.

You are given the paper's title, every question on it with its question summary, command word, assessment objective and topic(s) where known, the student's marks on each, and their marks per topic.

Look across the whole paper for what kinds of question, skill or topic the student handles well and where they lose marks: for example multi-step calculations, explaining a process, recalling definitions, graph work, or a particular topic. A theme can span several questions and topics; a single question is only a theme when nothing broader fits. Each theme must be one kind of question or skill the student would recognise: never bundle unrelated questions to fill a slot. Fewer themes is better than a muddled one.

Write:
- "strengths": up to three themes the student did well on. Only use questions where they gained at least two fifths of the marks; prefer full marks.
- "areasForImprovement": up to two themes where the student has the most marks to win back. Only use questions where they dropped at least one mark. If they dropped no marks, return an empty list.
For each theme, list the labels of the questions it is based on in "questions".

The student will not see which questions you based a theme on, so name the kind of question or skill clearly in words.

Each strength: one short sentence, at most 20 words, naming the kind of question or skill and what doing it well shows they can do. Match the praise to the marks.

Each area for improvement: two sentences, at most 40 words in total. First, what that kind of question needs. Second, one concrete revision action the student can do on their own (a specific thing to learn, practise or rewrite), not "revise this topic" or "review the equations". Use your subject knowledge to make the action specific.

Address the student as "you". Plain, warm and direct, like a good teacher's written comment. No gushing, no exclamation marks.

You only have the student's marks, never their answers. Marks tell you whether they got something right, not how. So never describe their answer: not their method, working, clarity, reasoning, detail or explanations, and never "you struggled", "your answer lacked" or "your explanation".

Never:
- write any figures or question labels in the prose: no marks, scores, percentages, grades, counts, question numbers or numbers of any kind. The labels go in "questions" only.
- compare the student to the class, classmates or anyone else.
- name or address anyone by name.
- predict or mention grades or results.`;

export function holisticSchema(payload: HolisticPayload) {
	const theme = (max: number) => ({
		type: 'array',
		maxItems: max,
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['text', 'questions'],
			properties: {
				text: { type: 'string' },
				questions: {
					type: 'array',
					items: { type: 'string', enum: payload.questions.map((q) => q.label) }
				}
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
			properties: { strengths: theme(3), areasForImprovement: theme(2) }
		}
	};
}
