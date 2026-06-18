/*
 * Local stylelint plugin: tlf/focus-visible-pairing  (Story 1.3, AC #3 / #4)
 *
 * The focus ring is the load-bearing accessibility control surface, so this
 * cannot be a doc-only rule. It FAILS the build when a stylesheet removes the
 * default outline (`outline: none` / `outline: 0`) without restoring the
 * committed keyboard-focus ring via a `:focus-visible` rule.
 *
 * Scope/limit (documented honestly): the pairing is checked per-stylesheet
 * (root), not per-selector — a file that kills the outline must contain at
 * least one `:focus-visible` rule with the exact committed outline and offset.
 * That is sufficient for our model (the base ring lives once in global.css;
 * component CSS that opts out of it must re-establish it in the same file). A
 * selector-precise pairing check is intentionally out of scope.
 */

import stylelint from 'stylelint'

const ruleName = 'tlf/focus-visible-pairing'
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (prop) =>
    `Unpaired "${prop}" that removes the focus outline — add a ":focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }" rule in the same file so keyboard focus stays visible.`,
})
const meta = {
  url: 'https://stylelint.io/user-guide/rules#plugins',
}

const ruleFunction = (primary) => (root, result) => {
  const validOptions = stylelint.utils.validateOptions(result, ruleName, {
    actual: primary,
    possible: [true, false],
  })
  if (!validOptions || !primary) return

  // Does this stylesheet restore the committed keyboard-focus ring via
  // :focus-visible?
  let restoresFocusRing = false
  root.walkRules((rule) => {
    if (!hasPositiveFocusVisible(rule.selector)) return

    let hasCommittedOutline = false
    let hasCommittedOffset = false
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase()
      const value = normalizeDeclarationValue(decl.value)
      if (prop === 'outline' && value === '2px solid var(--color-focus)') {
        hasCommittedOutline = true
      }
      if (prop === 'outline-offset' && value === '2px') {
        hasCommittedOffset = true
      }
    })

    if (hasCommittedOutline && hasCommittedOffset) {
      restoresFocusRing = true
    }
  })

  if (restoresFocusRing) return

  // No paired :focus-visible ring in this file — flag any outline removal.
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase()
    const value = normalizeDeclarationValue(decl.value)
    const removesOutline =
      (prop === 'outline' &&
        (value === 'none' ||
          value === '0' ||
          value === '0px' ||
          value.startsWith('0 ') ||
          value.startsWith('0px ') ||
          value === 'unset' ||
          value === 'initial' ||
          value === 'revert')) ||
      (prop === 'outline-style' && value === 'none') ||
      (prop === 'outline-width' && (value === '0' || value === '0px')) ||
      (prop === 'outline-color' && value === 'transparent')

    if (!removesOutline) return

    stylelint.utils.report({
      message: messages.rejected(`${decl.prop}: ${decl.value}`),
      node: decl,
      result,
      ruleName,
    })
  })
}

ruleFunction.ruleName = ruleName
ruleFunction.messages = messages
ruleFunction.meta = meta

function normalizeDeclarationValue(value) {
  return value
    .replace(/\s*!important\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function hasPositiveFocusVisible(selector) {
  return /:focus-visible/.test(selector) && !/:not\(\s*:focus-visible\s*\)/.test(selector)
}

export default stylelint.createPlugin(ruleName, ruleFunction)
