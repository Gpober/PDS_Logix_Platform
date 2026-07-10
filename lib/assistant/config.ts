// One place to name and tune the assistant. Rename here and it changes
// everywhere — persona, prompt, and UI all read from this.
export const ASSISTANT_NAME = 'Logix';
export const ASSISTANT_MODEL = 'claude-opus-4-8';

// The assistant reads live CRM data through tools, so give the loop some room.
export const ASSISTANT_MAX_TOKENS = 3072;
