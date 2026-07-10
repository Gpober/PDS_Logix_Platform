import Anthropic from '@anthropic-ai/sdk';

// AI caption assist for the content planner. Server-only — the API key never
// reaches the browser. Gated like the other integrations so the button hides
// when it isn't configured.
export const anthropicConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export async function draftInstagramCaption(params: {
  imageUrl?: string | null;
  isVideo?: boolean;
  brand?: string | null;
}): Promise<{ ok: true; caption: string } | { ok: false; error: string }> {
  if (!anthropicConfigured()) return { ok: false, error: 'AI captions aren’t set up yet.' };

  const brandLine = params.brand
    ? `This is a paid partnership post for ${params.brand} — mention the brand naturally.`
    : '';
  const prompt =
    `Write one Instagram caption for a creator's ${params.isVideo ? 'Reel' : 'photo'} post. ` +
    `${brandLine} ` +
    `Voice: authentic, first person, warm — like the creator wrote it themselves, not an ad. ` +
    `Keep it to 1–3 short sentences, then 3–6 relevant hashtags on a new line. ` +
    `Return only the caption text — no preamble, no surrounding quotes, no alternatives.`;

  try {
    const client = new Anthropic();
    // Ground the caption in the actual photo when we have one (skip for videos —
    // we can't send a frame). Opus 4.8 reads the image straight from its URL.
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          params.imageUrl && !params.isVideo
            ? [
                { type: 'image', source: { type: 'url', url: params.imageUrl } },
                { type: 'text', text: prompt },
              ]
            : prompt,
      },
    ];

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages,
    });

    const caption = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!caption) return { ok: false, error: 'The model returned an empty caption.' };
    return { ok: true, caption };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Caption generation failed.' };
  }
}
