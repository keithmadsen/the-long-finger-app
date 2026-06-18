/*
 * Self-test for the token-name lint (Story 1.3, AC #3).
 *
 * Proves the lint actually GATES — that each forbidden pattern is caught and
 * the sanctioned exemptions / focus-ring pairing pass. Runs the project's real
 * stylelint config against in-memory CSS fixtures (so nothing pollutes the
 * shipped bundle) and asserts the expected rule fired (or stayed silent).
 *
 * Run: `npm run lint:css:selftest --workspace apps/web`. Exits non-zero on any
 * surprise, so it doubles as a CI guard against the lint silently rotting.
 */

import stylelint from 'stylelint'

const CONFIG_FILE = new URL('../stylelint.config.js', import.meta.url).pathname

/** Lint one fixture and return the set of rule names that fired. */
async function rulesFired(code, codeFilename) {
  const { results } = await stylelint.lint({
    code,
    codeFilename,
    configFile: CONFIG_FILE,
  })
  return new Set(results[0].warnings.map((w) => w.rule))
}

const cases = [
  // --- forbidden patterns: each MUST fire the named rule -----------------
  {
    name: 'literal hex in a component file is rejected',
    code: '.row { color: #ffffff; }',
    file: 'src/components/row.css',
    expect: 'color-no-hex',
  },
  {
    name: 'named color in a component file is rejected',
    code: '.row { color: red; }',
    file: 'src/components/row.css',
    expect: 'color-named',
  },
  {
    name: 'rgb() color function in a component file is rejected',
    code: '.row { color: rgb(0 0 0); }',
    file: 'src/components/row.css',
    expect: 'function-disallowed-list',
  },
  {
    name: 'off-scale px on a spacing property is rejected',
    code: '.row { padding: 13px; }',
    file: 'src/components/row.css',
    expect: 'declaration-property-unit-disallowed-list',
  },
  {
    name: 'on-scale px on a spacing property is also rejected (use the token)',
    code: '.row { padding: 16px; }',
    file: 'src/components/row.css',
    expect: 'declaration-property-unit-disallowed-list',
  },
  {
    name: 'literal color-name custom property is rejected (even in tokens.css)',
    code: ':root { --color-white: #ffffff; }',
    file: 'src/styles/tokens.css',
    expect: 'custom-property-pattern',
  },
  {
    name: 'less-obvious literal color-name custom property is rejected',
    code: ':root { --color-beige: #f5f4ef; }',
    file: 'src/styles/tokens.css',
    expect: 'custom-property-pattern',
  },
  {
    name: 'outline:none without a paired :focus-visible is rejected',
    code: '.btn { outline: none; }',
    file: 'src/components/btn.css',
    expect: 'tlf/focus-visible-pairing',
  },
  {
    name: 'outline removal with transparent shorthand is rejected',
    code: '.btn { outline: 0 solid transparent; }',
    file: 'src/components/btn.css',
    expect: 'tlf/focus-visible-pairing',
  },
  {
    name: 'outline:none with an incomplete :focus-visible ring is rejected',
    code: '.btn { outline: none; } .btn:focus-visible { outline: 1px solid var(--color-focus); outline-offset: 2px; }',
    file: 'src/components/btn.css',
    expect: 'tlf/focus-visible-pairing',
  },
  {
    name: 'outline:none with missing focus-visible offset is rejected',
    code: '.btn { outline: none; } .btn:focus-visible { outline: 2px solid var(--color-focus); }',
    file: 'src/components/btn.css',
    expect: 'tlf/focus-visible-pairing',
  },
  // --- sanctioned cases: the named rule MUST NOT fire --------------------
  {
    name: 'raw hex IS allowed in tokens.css (the one sanctioned home)',
    code: ':root { --color-surface: #fafaf7; }',
    file: 'src/styles/tokens.css',
    expectNot: 'color-no-hex',
  },
  {
    name: 'off-scale px IS allowed in tokens.css (it declares the scale)',
    code: ':root { --font-size-secondary: 14px; }',
    file: 'src/styles/tokens.css',
    expectNot: 'declaration-property-unit-disallowed-list',
  },
  {
    name: 'outline:none paired with a :focus-visible ring passes',
    code: '.btn { outline: none; } .btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }',
    file: 'src/components/btn.css',
    expectNot: 'tlf/focus-visible-pairing',
  },
]

let failures = 0
for (const c of cases) {
  const fired = await rulesFired(c.code, c.file)
  if (c.expect) {
    if (fired.has(c.expect)) {
      console.log(`  ok   ✓ ${c.name}  [${c.expect} fired]`)
    } else {
      failures++
      console.log(
        `  FAIL ✗ ${c.name}  — expected "${c.expect}" to fire, got: {${[...fired].join(', ')}}`,
      )
    }
  } else {
    if (!fired.has(c.expectNot)) {
      console.log(`  ok   ✓ ${c.name}  [${c.expectNot} silent]`)
    } else {
      failures++
      console.log(`  FAIL ✗ ${c.name}  — "${c.expectNot}" fired but should not have`)
    }
  }
}

console.log(
  failures === 0
    ? `\nToken-name lint self-test: all ${cases.length} cases passed.`
    : `\nToken-name lint self-test: ${failures}/${cases.length} cases FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
