#!/usr/bin/env python3
"""Render template.html with sample (or real) figures, to preview design changes.

    python3 render_preview.py                 # sample data -> preview.html
    python3 render_preview.py data.json       # your own figures

data.json is a list of {"name", "location", "day", "week", "month"} — the same
shape connecteam_production_report returns per worker, with the three periods
merged into one row.

The Routine that actually sends this email (trig_01ELof69xS3t1fwR6Zk3GGMC,
"Daily Piecework Report") holds its own copy of template.html in its prompt.
EDITING THE TEMPLATE HERE DOES NOT CHANGE THE EMAIL — update the Routine too.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# The photo department, by name. Everyone else the report returns is piecework.
PHOTO_SIX = [
    'Esthefany Delgado', 'Blanca Tinoco', 'Andriu Gonzalez',
    'Jean Clauda Richard', 'Dariany Tua', 'Jean Ernst Petit',
]

# BILLING prices per piece — not the workers' pay rates.
CRS_PRICE = {'Manheim Dallas': 19.50, 'Manheim DFW': 19.50, 'Manheim Atlanta': 21.00}
PHOTO_PRICE = 5.00

TINTS = {  # (day, week, month, revenue colour)
    'piecework': ('#F9FBFF', '#F9FEFB', '#FFFCF8', '#D97706'),
    'photo':     ('#F8FAFF', '#F7FEFB', '#FFFCF8', '#4F46E5'),
}

# Match the artifact: 760.5 rounds to 761, and each TOTALS figure is the sum of
# the rounded rows above it so every column visibly adds up.
half_up = lambda x: int(x + 0.5)
money = lambda n: '$' + format(int(n), ',')

SAMPLE = [
    {'name': 'Chadwick Williams',   'location': 'Manheim Dallas',  'day': 39, 'week': 81,  'month': 292},
    {'name': 'David Munoz',         'location': 'Manheim Dallas',  'day': 27, 'week': 118, 'month': 403},
    {'name': 'Kevin J. Arevalo',    'location': 'Manheim Dallas',  'day': 0,  'week': 67,  'month': 354},
    {'name': 'Maximus Matthews',    'location': 'Manheim Dallas',  'day': 0,  'week': 115, 'month': 330},
    {'name': 'Daniel Restrepo',     'location': 'Manheim Atlanta', 'day': 0,  'week': 55,  'month': 55},
    {'name': 'Esthefany Delgado',   'location': 'Manheim DFW',     'day': 56, 'week': 319, 'month': 960},
    {'name': 'Blanca Tinoco',       'location': 'Manheim Dallas',  'day': 0,  'week': 210, 'month': 1034},
    {'name': 'Andriu Gonzalez',     'location': 'Manheim DFW',     'day': 69, 'week': 267, 'month': 866},
    {'name': 'Dariany Tua',         'location': 'Manheim DFW',     'day': 0,  'week': 111, 'month': 410},
    {'name': 'Jean Clauda Richard', 'location': 'Manheim',         'day': 0,  'week': 0,   'month': 0},
    {'name': 'Jean Ernst Petit',    'location': 'Manheim',         'day': 0,  'week': 0,   'month': 0},
]
SAMPLE_AS_OF = 'Aug 21, 2026'


def pair(pieces, revenue, tint, revcolour):
    base = f'background-color:{tint};padding:12px 14px;font-family:Consolas,Menlo,monospace;'
    if not pieces:
        muted = f'<td align="right" style="{base}color:#94A3B8;">&mdash;</td>'
        return muted * 2
    return (f'<td align="right" style="{base}color:#1A2332;">{format(pieces, ",")}</td>'
            f'<td align="right" style="{base}font-weight:700;color:{revcolour};">{money(revenue)}</td>')


def section(rows, kind):
    """Return (rows_html, [day_pc, day_rev, week_pc, week_rev, month_pc, month_rev])."""
    day_tint, week_tint, month_tint, revcolour = TINTS[kind]
    tints = (day_tint, week_tint, month_tint)
    out, totals, unpriced = [], [0] * 6, set()
    # Yesterday desc, then month desc — reproduces the approved row order.
    for r in sorted(rows, key=lambda r: (-r['day'], -r['month'])):
        loc = r['location']
        rate = PHOTO_PRICE if kind == 'photo' else CRS_PRICE.get(loc)
        if rate is None:
            unpriced.add(loc)
        subline = loc if kind == 'photo' or rate is None else f'{loc} &middot; ${rate:.2f}/pc'
        counts = (r['day'], r['week'], r['month'])
        revs = [0 if rate is None else half_up(c * rate) for c in counts]
        for i, (c, rev) in enumerate(zip(counts, revs)):
            totals[i * 2] += c
            totals[i * 2 + 1] += rev
        cells = '\n    '.join(pair(c, rev, tints[i], revcolour) for i, (c, rev) in enumerate(zip(counts, revs)))
        out.append(
            '  <tr>\n'
            '    <td style="padding:12px 14px 12px 24px;border-bottom:1px solid #E2E8F0;">'
            f'<div style="font-weight:600;color:#1A2332;font-size:13px;">{r["name"]}</div>'
            '<div style="font-size:11px;color:#94A3B8;font-family:Consolas,Menlo,monospace;padding-top:2px;">'
            f'{subline}</div></td>\n'
            f'    {cells}\n'
            '  </tr>')
    if unpriced:
        print(f'  ! no billing price for: {", ".join(sorted(unpriced))}', file=sys.stderr)
    return '\n'.join(out), totals


def render(workers, as_of):
    html = open(os.path.join(HERE, 'template.html')).read()
    photo = [w for w in workers if w['name'] in PHOTO_SIX]
    crs = [w for w in workers if w['name'] not in PHOTO_SIX]
    pw_rows, pw = section(crs, 'piecework')
    ph_rows, ph = section(photo, 'photo')
    html = (html
            .replace('<!-- PIECEWORK_ROWS -->', pw_rows)
            .replace('<!-- PHOTO_ROWS -->', ph_rows)
            .replace('<!-- WARNING_BANNER -->', ''))
    values = {
        'AS_OF': as_of,
        'DAY_CRS': money(pw[1]), 'DAY_PHOTO': money(ph[1]),
        'WEEK_CRS': money(pw[3]), 'WEEK_PHOTO': money(ph[3]),
        'MONTH_CRS': money(pw[5]), 'MONTH_PHOTO': money(ph[5]),
    }
    for i, key in enumerate(['D_PC', 'D_REV', 'W_PC', 'W_REV', 'M_PC', 'M_REV']):
        values[f'PW_{key}'] = format(pw[i], ',') if 'PC' in key else money(pw[i])
        values[f'PH_{key}'] = format(ph[i], ',') if 'PC' in key else money(ph[i])
    for key, value in values.items():
        html = html.replace('{{' + key + '}}', value)
    if '{{' in html:
        raise SystemExit('unfilled placeholder left in template')
    return html, pw, ph


if __name__ == '__main__':
    workers, as_of = SAMPLE, SAMPLE_AS_OF
    if len(sys.argv) > 1:
        workers = json.load(open(sys.argv[1]))
        as_of = 'preview'
    html, pw, ph = render(workers, as_of)
    out = os.path.join(HERE, 'preview.html')
    with open(out, 'w') as fh:
        fh.write('<!doctype html><meta charset="utf8"><body style="margin:0">' + html + '</body>')
    for label, i in (('day', 0), ('week', 2), ('month', 4)):
        print(f'{label:<6} piecework {pw[i]:>6,} pcs  photo {ph[i]:>6,} pcs  total {pw[i] + ph[i]:>6,} pcs')
    print(f'wrote {out}')
