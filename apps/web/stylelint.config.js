/*
 * Stylelint config — the "token-name lint" (Story 1.3, AC #3).
 *
 * Load-bearing rules, all of which FAIL the build:
 *   1. Literal color values (hex / named / rgb()/hsl()/lab()…) are forbidden in
 *      every CSS file EXCEPT tokens.css — the single sanctioned home for raw
 *      color literals. Components must reference --color-* tokens.
 *   2. Off-scale px on spacing/layout properties is forbidden (force --space-*
 *      / --row-height-* tokens). tokens.css is exempt (it declares the scale).
 *   3. Custom-property names must be semantic, never literal color names
 *      (`--color-white`, `--color-grey-100`, …) — AC #1.
 *   4. `outline: none` / `outline: 0` not paired with a `:focus-visible` rule is
 *      forbidden — enforced by the local plugin in ./stylelint-plugins. AC #4.
 *
 * stylelint-config-standard is the stylistic base. The contrast-regression,
 * axe-core, forced-colors/reduced-motion/zoom and bundle-size gates are NOT
 * here — they arrive with the rendered list view in Story 1.6.
 */

const COLOR_FUNCTIONS = [
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
]

// Spacing/layout properties that must draw from the token scale, never literal px.
const SPACING_PROPERTIES = {
  '/^margin/': ['px'],
  '/^padding/': ['px'],
  '/^inset/': ['px'],
  '/gap$/': ['px'],
  '/^(top|right|bottom|left)$/': ['px'],
  '/^(width|height|min-width|max-width|min-height|max-height)$/': ['px'],
}

export default {
  extends: ['stylelint-config-standard'],
  plugins: ['./stylelint-plugins/focus-visible-pairing.js'],
  rules: {
    // Relax two cosmetic whitespace opinions from config-standard that fight the
    // deliberately compact, grouped token file. This lint is about token/color/
    // px/focus substance, not blank-line placement.
    'custom-property-empty-line-before': null,
    'comment-empty-line-before': null,

    // (1) No literal color values outside tokens.css.
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': COLOR_FUNCTIONS,

    // (3) Semantic custom-property names; reject literal color names. The body
    // is kebab-case (matching config-standard); the leading negative lookahead
    // rejects `color-<literal>` names.
    'custom-property-pattern': [
      '^(?!color-(?:white|black|gray|grey|red|green|blue|yellow|orange|purple|pink|brown|cyan|magenta|silver|gold|teal|navy|maroon|olive|lime|aqua|fuchsia)(?:-|$))[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
      {
        message:
          'Custom property names must be semantic, not literal color names (e.g. --color-surface, not --color-white).',
      },
    ],

    // (2) Off-scale px on spacing/layout properties — force --space-* tokens.
    'declaration-property-unit-disallowed-list': SPACING_PROPERTIES,

    // (4) outline:none must be paired with a :focus-visible rule (local plugin).
    'tlf/focus-visible-pairing': true,
  },
  overrides: [
    {
      // tokens.css is the one file allowed to declare raw color/px literals.
      files: ['**/tokens.css'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null,
        'declaration-property-unit-disallowed-list': null,
      },
    },
  ],
}
