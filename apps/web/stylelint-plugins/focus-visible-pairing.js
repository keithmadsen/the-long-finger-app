/*
 * Local stylelint plugin: tlf/focus-visible-pairing  (Story 1.3, AC #3 / #4)
 *
 * The focus ring is the load-bearing accessibility control surface, so this
 * cannot be a doc-only rule. It FAILS the build when a stylesheet removes the
 * default outline (`outline: none` / `outline: 0`) without restoring a visible
 * keyboard-focus ring via a `:focus-visible` rule that uses `var(--color-focus)`.
 *
 * Scope/limit (documented honestly): the pairing is checked per-stylesheet
 * (root), not per-selector — a file that kills the outline must contain at
 * least one `:focus-visible { outline: … var(--color-focus) … }` rule. That is
 * sufficient for our model (the base ring lives once in global.css; component
 * CSS that opts out of it must re-establish it in the same file). A
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

  // Does this stylesheet restore the keyboard-focus ring via :focus-visible?
  let restoresFocusRing = false
  root.walkRules((rule) => {
    if (!/:focus-visible/.test(rule.selector)) return
    rule.walkDecls(/^outline/i, (decl) => {
      if (/var\(\s*--color-focus/i.test(decl.value)) {
        restoresFocusRing = true
      }
    })
  })

  if (restoresFocusRing) return

  // No paired :focus-visible ring in this file — flag any outline removal.
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase()
    const value = decl.value.trim().toLowerCase()
    const removesOutline =
      (prop === 'outline' && (value === 'none' || value === '0' || value === '0px')) ||
      (prop === 'outline-style' && value === 'none') ||
      (prop === 'outline-width' && (value === '0' || value === '0px'))

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

export default stylelint.createPlugin(ruleName, ruleFunction)
