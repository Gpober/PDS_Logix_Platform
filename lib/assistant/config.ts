// One place to name and tune the assistant. Rename here and it changes
// everywhere — persona, prompt, and UI all read from this.
export const ASSISTANT_NAME = 'Zordon';
export const ASSISTANT_MODEL = 'claude-opus-4-8';

// Ceiling, not a target — the model stops when it's done. Kept generous so a
// long answer or a sizable tool call (e.g. a pasted-in contact list) isn't cut
// off mid-output.
export const ASSISTANT_MAX_TOKENS = 8192;
