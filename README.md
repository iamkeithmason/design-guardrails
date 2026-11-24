# design-guardrails

Checks what a web page **renders** against its design tokens, whatever framework
built it. It loads each route in headless Chrome at 1440 and 390px, reads the
computed style of every visible element and its `::before` and `::after`, and
fails on a value that is not a token, a named type style, or a listed exception.

| Family | Fails when |
| --- | --- |
| Colour | text, background, border, shadow or SVG paint is not a colour token or a token at reduced alpha |
| Type | a text treatment is not a named style (strict) or not in the baseline |
| Space | a margin, padding or gap is not a spacing token, resolved at that width |
| Radius | a corner radius is not a radius token |
| Duration, easing | a transition or animation uses a value that is not a motion token |
| Icons | an icon is not the font size of a paired type style, or its box is not that style's line height (or a tap target) |
| Reduced motion | anything still animates, or any box moves within 300ms, with `prefers-reduced-motion: reduce` |
| Source (optional) | a raw `ms`/`s` in a `transition` or `animation`, or a `@keyframes`, outside the tokens file |

## Use

```sh
npm i -D playwright github:iamkeithmason/design-guardrails#V0.1.0
# pinned to a release, so updates arrive only when you move the tag
npx design-guardrails --baseline   # existing project: record today's drift, once
npx design-guardrails              # check
npx design-guardrails --report     # the full inventory per family
```

Configure it with `design-guardrails.json` at the repository root;
`kit/design-guardrails.json` is a starting point and `kit/design-guardrails.yml`
the CI job. `kit/icon.css` is the icon pair the icon rule expects.

- **Modes.** `strict` (new projects): every off-token value fails. `baseline`
  (existing projects): only values the baseline does not hold fail.
- **The baseline may only shrink.** `--baseline` writes it the first time; after
  that it only deletes entries nothing renders any more, and refuses if anything
  new is off-token. Admitting a value means editing the file by hand.
- **Exceptions** need a reason, and one that matches nothing is reported.
- **Exit codes.** 0 clean, 1 drift, 2 could not run. CI fails on both 1 and 2.

## Known limits

- Hover and focus states are not rendered; the source rule covers their motion
  for plain CSS only.
- An off-scale value gets the nearest token as a hint. The rendered check
  cannot tell a raw `16px` from `var(--space-4)`; both render as 16px and pass.
- The icon box defaults to the icon's parent. Set `icons.box` to a selector when
  icons sit inside larger containers.
- Images, canvas, video, native screens and print are out of scope.

## References

`references/` holds the reasoning behind the design-guardrails skill's rules,
for a person or an agent to read before a decision the rules don't settle.
`references/motion.md` covers how Emil Kowalski approaches interface motion,
with worked examples from the portfolio.

## Tests

`npm test`: the pure classifier and the source rule against planted defects,
then the CLI end to end on `test/fixtures/bad` (one of each defect, must exit 1
and name each) and `test/fixtures/good` (must exit 0).

Proven on the portfolio on 23 November 2026: the same 65 text treatments as its
own `check:design`, the same set exactly, and no colour outside its tokens beyond one listed exception.
