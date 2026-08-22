# Daily Production Report — email template

The email Nelson and Greg get every morning at 7:03am CT: yesterday / this week
/ this month, in pieces and revenue, split into Piecework and Photo Dept.

## Where this actually runs

**Not in this repo.** The email is sent by a Claude Routine —
`trig_01ELof69xS3t1fwR6Zk3GGMC`, "Daily Piecework Report", `0 12 * * *` (12:00
UTC) — which pulls `connecteam_production_report` for the three periods and
fills the template below.

**The Routine holds its own copy of `template.html` inside its prompt. Editing
the file here does not change the email.** Change both, or the design drifts.
This copy exists so the design is version-controlled and reviewable, and so
`render_preview.py` can show you a change before it reaches an inbox.

The data behind it comes from `production_entries`, filled by the nightly sync
documented in `supabase/README.md`.

## The template

`template.html` is fill-only — email-safe HTML with inline styles, table layout
and literal hex. No `<style>` block, no CSS custom properties, no dark-mode
media queries: mail clients strip all three. Placeholders:

| Placeholder | Value |
|---|---|
| `{{AS_OF}}` | yesterday, e.g. `Aug 21, 2026` |
| `{{DAY_CRS}}` `{{DAY_PHOTO}}` … | the six summary pills — each section's TOTALS revenue |
| `{{PW_D_PC}}` `{{PW_D_REV}}` … | Piecework totals row (D/W/M × pieces/revenue) |
| `{{PH_D_PC}}` `{{PH_D_REV}}` … | Photo Dept totals row |
| `<!-- PIECEWORK_ROWS -->` `<!-- PHOTO_ROWS -->` | one row block per worker |
| `<!-- WARNING_BANNER -->` | empty normally; the red banner when a weekday reports zero pieces |

## Rules the numbers follow

- **Photo Dept is six named people** (see `PHOTO_SIX` in `render_preview.py`),
  always listed even at zero. Everyone else the report returns is Piecework —
  never a hardcoded list, so a new hire can't silently go missing.
- **Revenue uses BILLING prices, not the workers' pay rates.** Manheim Dallas
  and Manheim DFW $19.50/pc, Manheim Atlanta $21.00/pc, Photo $5.00/pc. An
  unpriced location shows pieces with an empty revenue cell — never a guess.
- **Round each row half-up** (760.5 → 761), then total the rounded rows, so
  every column adds up on screen. Python's `round()` is banker's rounding and
  gives 760 — don't use it here.
- **Sort by yesterday's pieces desc, then month desc.**

## Previewing a change

```bash
python3 render_preview.py            # sample figures -> preview.html
python3 render_preview.py data.json  # your own [{name, location, day, week, month}]
```

The sample is real production through Aug 21 2026 and reconciles to
`production_entries`: 191 pieces yesterday, 1,343 this week, 4,704 this month.

## Known gaps

- It sends from the connected Gmail account, not `reports@iamcfo.com` — the
  Gmail tool has no `from` field. A real send-as alias would be needed.
- Outlook desktop ignores `border-radius`, so the card corners square off.
