# Motion reference: how Emil Kowalski approaches it

The design-guardrails skill states the motion rules. This file holds the
reasoning behind them and worked examples, so a future decision can be argued
from first principles instead of matched against a list. Read it before
choosing motion tokens for a project, adding a new kind of motion, or reviewing
motion that feels off.

Sources, all free and public, read on 24 November 2026:

- Articles on [emilkowal.ski](https://emilkowal.ski/): *Great Animations*,
  *You Don't Need Animations*, *7 Practical Animation Tips*, *The Magic of Clip
  Path*, *Building a Toast Component*, *Building a Drawer Component*,
  *Developing Taste*.
- His public skill, `emil-design-eng`, in
  [github.com/emilkowalski/skills](https://github.com/emilkowalski/skills).
  The same repository lists related skills (review-animations,
  improve-animations, choreograph, animation-performance and others) that were
  not read.
- His course, *Animations on the Web* (animations.dev), is not public and is
  not summarised here.

Everything below is paraphrase. Where a rule comes from his skill rather than
an article, it says so.

## The stance

**Motion has to earn its place.** Every animation needs a job: explaining how
something works, keeping things spatially consistent (a toast leaves the way it
came), confirming an action (a button that gives under the finger), or now and
then plain delight. Motion without a job overwhelms people, and animations stop
meaning anything when everything moves.

**Frequency decides how much motion a thing gets.** This is the question that
settles most cases. Something a person sees once, such as an onboarding flourish
or a first arrival, can be slower and more expressive. Something they trigger
tens of times a day, such as a hover, a list selection or a menu, should be
fast or still. Anything triggered from the keyboard should not animate at all:
a power user hits it hundreds of times a day, and motion makes it feel slow and
disconnected. He holds up Raycast, which has no open or close animation, as
feeling right because of that.

**The best detail goes unnoticed.** He judges good interface motion by how
little people notice it. A press that confirms a click, or a toast that arrives
from where you'd expect, should feel natural rather than be seen. If a person
notices the animation before the content, it is doing too much. This matches
the portfolio's own rule.

**Speed is perceived performance.** Fast, snappy motion makes a product feel
quicker than it is. A 180ms dropdown feels more responsive than a 400ms one,
even though both are "fast".

**Taste is trained, not innate.** Study why an interaction feels good, look at
a lot of excellent work, and practise. Get the timing right by trial and error:
watch motion slowed down 2 to 5 times and frame by frame, and look again the
next day with fresh eyes.

## How he chooses values

### Duration by what the element is

From his skill:

| Element | Duration |
| --- | --- |
| Button press | 100 to 160ms |
| Tooltips, small popovers | 125 to 200ms |
| Dropdowns, selects | 150 to 250ms |
| Modals, drawers, sheets | 200 to 500ms |
| Toasts | about 400ms |
| Explanatory or marketing motion | longer |

Interface motion stays under 300ms; modals, drawers, sheets and toasts are the
exception. Exits run faster than entrances (for example 250ms in, 200ms out),
because by the time someone dismisses a thing they have already moved on.

### Easing by what the motion does

- **Entering or leaving:** ease-out, so the thing responds at once and settles.
  He finds the built-in `ease-out` too weak and uses a stronger curve, such as
  `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Moving or morphing something already on screen:** a strong ease-in-out,
  such as `cubic-bezier(0.77, 0, 0.175, 1)`. He also uses this one for a 1s
  `clip-path` image reveal.
- **Hover and colour changes:** `ease`.
- **Constant motion,** such as a progress bar: `linear`.
- **Sheets and drawers:** `cubic-bezier(0.32, 0.72, 0, 1)` over 500ms, the curve
  iOS uses for its sheets.
- **Never ease-in** for interface motion. It starts slowly, which reads as lag
  at exactly the moment a person is waiting for a response. An ease-in at 300ms
  feels slower than an ease-out at 300ms.
- **For a deliberate, elegant feel** he sometimes chooses plain `ease` and a
  slightly longer duration (Sonner's toasts are 400ms `ease`). The curve should
  match the character of the component and the product.

He points to easings.co and easing.dev for finding custom curves.

### Scale

- **A press** shrinks a button to 0.95 to 0.98 while it is held (0.97 is the
  usual pick). It confirms the click before anything else happens.
- **Never animate from `scale(0)`.** Real things do not appear from a point. He
  compares it to a deflated balloon, which still has a shape: start at 0.93 to
  0.95 together with opacity 0.
- **Origin matters.** A popover grows from the control that opened it
  (`transform-origin` set to the trigger); a modal grows from the centre.

## Mechanics he insists on

- **Animate only `transform` and `opacity`** (and the separate `translate`,
  `scale` and `rotate`). They skip layout and paint, so they stay at 60fps.
  Animating padding, margin, width or height makes the browser lay the page out
  every frame. If motion drops frames, nothing else about it matters.
- **Prefer hardware-accelerated motion when the page is busy.** CSS animations
  and the Web Animations API keep running smoothly while the main thread loads a
  page; animation driven by `requestAnimationFrame` (Framer Motion, for one)
  stutters. He moved a Vercel dashboard tab animation to CSS for this reason.
- **Interruptible motion uses transitions, not keyframes.** A CSS transition
  reverses from wherever it is when the state changes again; a keyframe
  animation restarts from zero and jumps. Toasts added in quick succession are
  his example.
- **Hover only with a real pointer.** Wrap hover effects in
  `@media (hover: hover) and (pointer: fine)`. On a phone a tap triggers hover,
  and the effect stays stuck after the finger lifts.
- **Blur can hide a clumsy crossfade.** If tuning easing and duration does not
  fix a muddy crossfade, add `filter: blur(2px)` while it runs. Keep blur under
  20px, because heavy blur is slow in Safari.
- **Stagger is decoration.** 30 to 80ms between items, from his skill, and it
  must never hold up interaction.
- **Scroll reveals fire once**, when the element is properly in view (he uses a
  margin of about 100px), and do not replay on scroll back.
- **Springs belong to gestures.** Use them for drags, flicks and anything that
  can be interrupted mid-motion, because a spring keeps its velocity. Keep the
  bounce low (0.1 to 0.3) and leave it out of most interface motion.
- **Drags should feel physical.** In his drawer, the panel follows the finger,
  slows (damping) past its limit instead of stopping hard, and dismisses on a
  quick flick as well as on distance.

## Reduced motion

Reduced motion means **gentler, not absent**. People who ask for it are
usually troubled by movement across the screen, not by things changing. So
remove translation, scaling and rotation, and keep opacity and colour changes.
A bounce becomes a fade, and a slide becomes a crossfade.

## Worked examples: the portfolio, 24 November 2026

How the reasoning above turned into decisions on iamkeithmason.com (draft PR
207 in the portfolio repository). These show the reasoning, not values to copy:
each project sets its own motion tokens.

- **The homepage arrival went from 700ms to 400ms.** His under-300ms rule is for
  motion people see over and over. A first arrival happens once per visit, so it
  sits under "explanatory or marketing, longer". The question was how much
  longer. A side-by-side video of 700ms and 400ms settled it: 400ms read as crisp
  rather than slow. Comparing two durations side by side is quicker and more
  honest than judging one alone.
- **The site's curve was already his sheet curve.** The nav drops in on
  `cubic-bezier(0.32, 0.72, 0, 1)`, the iOS sheet curve he uses for drawers. A
  nav arriving from the top edge behaves like a sheet, so the choice fitted.
- **Buttons press to 0.97 over 160ms** on a strong ease-out, using the separate
  `scale` property so `transform` stays free for hover lifts.
- **Cards press more gently, to 0.985.** Scale is relative: 0.97 on a 600px card
  pulls each edge in by 9px, which reads as the card collapsing. 0.99 was tried
  on paper and dropped, because a quick tap holds for only about 100ms and the
  shrink barely starts. The press matters most on phones, where a card has no
  hover and the press is the only sign the tap registered.
- **Every hover rule moved inside a `(hover: hover)` query,** and a check now
  fails any that escape. 45 of 48 hover rules had been unguarded.
- **The testimonial carousel kept its structure and changed its curve.** It
  already used transitions (so a quick second click redirects smoothly),
  animated only transform and opacity, and placed side cards at 0.94 rather than
  growing them from nothing. Its plain `ease` at 450ms became 400ms on the sheet
  curve, a strong ease-out for movement the reader starts, named as a "move"
  token. Under reduced motion it crossfades instead of jumping.
- **The homepage arrival keeps a fade under reduced motion,** losing only its
  rise.
- **What was left alone, and why:** the oak leaf's bouncy rustle on hover, an
  agreed signature exception that is rare and deliberate; and a swipe that
  follows the finger on the carousel, which would add motion and code for
  little gain on a component people touch a few times per visit.

## Using this in a review

1. For each moving thing, ask: what is its job, and how often will a person see
   it? If neither answer is strong, the fix may be removing it.
2. Check the duration against the element table and the easing against what
   the motion does.
3. Check the mechanics: transform and opacity only, transitions for anything
   interruptible, hover guarded, nothing from `scale(0)`.
4. Check reduced motion: does movement go while fades stay?
5. When unsure between two values, render both side by side and slow them down.
