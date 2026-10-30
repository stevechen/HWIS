# ADR-0031: Anchored popovers must not paint their edge or shadow with `--tw-*` utilities

## Status

Accepted. Applies to every element that can be repositioned by a
`@position-try` fallback.

## Context

Two popovers in the app are placed with CSS anchor positioning and flip above
their trigger when there is no room below:

- `src/routes/esl/admin/classes/AnchoredPanel.svelte` — the class card, schedule
  cell and availability panels.
- `src/lib/components/esl/wizard/Step5Panel.svelte` — the Step 5 inline event
  editor.

In Safari (and Playwright's WebKit build) the wizard popover lost its **border,
rounded corners and shadow** — but only when it flipped above the row. Below the
row it was perfect. The same bug had already been fixed once on the classes page,
which is why `AnchoredPanel` carries the rule in a comment; it was not written
down anywhere else, so the wizard repeated the investigation.

### What it is not

The first diagnosis was wrong and cost most of the time. It looked like the
popover was being clipped: the bottom edge was cut, the shadow ended in a hard
line, and the flip-above case was the only broken one. That reading produced
three fixes, none of which worked:

- **Bigger bottom margin in the flipped state** (supposedly giving the shadow
  room inside the inset-modified containing block). It moved the box and changed
  nothing else — because nothing was being clipped.
- **`will-change: filter, transform; transform: translateZ(0)`** to force a
  compositing layer. No effect.
- **Delegating the shadow to a `::before` pseudo-element.** This did render, but
  only because it also required `overflow: visible`; it forced the scroll
  container into an extra wrapper and was treating a symptom that did not exist.

`@supports (anchor-name: --x)` is no help either: WebKit supports anchor
positioning and still drops the values.

### What it actually is

**WebKit discards `@property`-registered custom properties while a
`@position-try` rule is active.** Tailwind v4 builds its edge and shadow
utilities out of exactly those properties:

```css
.border {
	border-style: var(--tw-border-style);
	border-width: 1px;
}
.shadow-xl {
	--tw-shadow: …;
	box-shadow:
		var(--tw-inset-shadow),
		… var(--tw-shadow);
}
```

When the registration lapses inside the try state, those declarations become
invalid at computed-value time:

- `border-style` falls back to `none`, so every border width computes to `0px`;
- the whole `box-shadow` chain resolves to `none`.

Everything resolved through a plain variable — `bg-white`
(`var(--color-white)`), `rounded-lg` (`var(--radius-lg)`), colours, padding —
keeps working. That is why the failure reads as "only the border and shadow
vanish", and why it looks like clipping.

Measured in WebKit with identical geometry, flipped above the anchor:

| markup on the popover                             | `border-style` | `border-bottom-width` | `box-shadow` |
| ------------------------------------------------- | -------------- | --------------------- | ------------ |
| `border border-gray-200 shadow-xl`                | `none`         | `0px`                 | `none`       |
| `[border:1px_solid_var(--border)] [box-shadow:…]` | `solid`        | `1px`                 | present      |

Chromium renders both correctly, so this is invisible in local development
unless the WebKit project is run.

## Decision

**An anchor-positioned element that can be flipped by `position-try-fallbacks`
must not paint its edge or shadow with utilities that resolve through
`@property`-registered `--tw-*` variables.** That covers `border`, `border-*`,
`shadow-*` and `ring-*`.

Use Tailwind **arbitrary properties**, which compile to literal declarations and
never enter the `--tw-*` chain:

```svelte
<div
	class="rounded-lg bg-white p-3
		[border:1px_solid_var(--border)]
		[box-shadow:0_20px_25px_-5px_#0000001a,0_8px_10px_-6px_#0000001a]"
>
```

`var(--border)` is the theme's border colour (dark-mode aware), because
`@theme inline` emits no `--color-*` variable for the custom theme colours.

Arbitrary **values** on the same properties do **not** help — `border-[1px]` and
`shadow-[0_20px_25px_-5px_#0000001a]` are normalized back into the `--tw-*`
chain and drop exactly like the named utilities. Only arbitrary _properties_
pass through verbatim.

Plain declarations in a component `<style>` block work too (they are what the
first fix used), but arbitrary properties are the convention here: one place for
the value, next to the element, no specificity interaction with utilities.

`rounded-*`, `bg-*`, colours, padding and the placement properties themselves
(`position-area`, `anchor()`, `margin`) are unaffected and stay as utilities or
plain CSS.

## Consequences

- `Step5Panel`'s edit popover uses the arbitrary-property form, matching
  `AnchoredPanel`. There is one pattern, not two.
- Any future anchored popover inherits the rule by copying either component.
- The failure is cheap to confirm: open the popover flipped above its trigger in
  WebKit and read `getComputedStyle(el).borderBottomWidth`. `0px` with
  `border-style: none` means this bug, not clipping — do not start adding
  margins.
- Placement mechanics are separate from this rule. `AnchoredPanel` documents why
  it positions with `anchor()` on the insets rather than `position-area`: the
  latter sizes the box from the position area, which let a panel's content spill
  past its own background when the area was shorter than the panel.
