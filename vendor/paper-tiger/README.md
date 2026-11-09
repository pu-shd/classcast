# Paper Tiger (vendored)

Design kit for Princeton ORFE companion apps, copied unmodified from
`pu-orfe/paper-tiger` at commit `8d391c8` (2026-07-09).

| File | Kit source |
|---|---|
| tokens.css, fonts.css | tokens/ |
| layout.css, header.css, footer.css, buttons.css, forms.css | components/ |
| logos/pu-logo.svg, logos/pu-logo-stacked.svg, logos/favicon.ico | assets/logos/ |

Don't edit these files; ClassCast's own styles and any overrides live in
`styles.css`. To update, copy the same files from a newer kit commit and
update the commit above.

Fonts: the kit's Adobe Typekit kit only serves allowed domains, so ClassCast
doesn't load it and uses the kit's open fallbacks (Source Sans 3 and Source
Serif 4 from Google Fonts, imported by fonts.css).
