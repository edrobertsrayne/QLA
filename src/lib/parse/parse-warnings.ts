// The findings a parse can raise, by code.
//
// A finding's code is part of the parse contract: a surface that reacts to one
// finding needs the same string the validator emits rather than a copy of it,
// so a rename cannot silently stop the reaction happening.

/** The model omitted a question number, so grouping falls back to the entry's own label. */
export const MISSING_QUESTION_NUMBER = 'MISSING_QUESTION_NUMBER';
