# Penguin hover prototype assets

Files: `penguin-relax-sprite.png`, `penguin-sleepy-sprite.png`, `penguin-hug-sprite.png`.

Derived with the built-in image generation tool from the user's three supplied penguin cards, without overwriting those originals.

Prompt (one per source): “Extract ONLY the full-body penguin and its held accessories as an isolated UI sprite on genuinely transparent alpha background. Remove the entire paper card, all text, ground shadow and surrounding motion strokes. Preserve exactly the black and cream hand-drawn penguin appearance, pose, face, texture and accessories. Center full penguin tightly within canvas with small even transparent padding, no clipping. No new elements. This is a cutout, not a redesign.”

The original extraction returned a painted checkerboard instead of alpha. Those files are retained for reference, but are no longer rendered by PenguinCards.jsx.

## Smooth texture revision

## Original lettering preservation

Background plates: `penguin-relax-plate.png`, `penguin-sleepy-plate.png`, `penguin-hug-plate.png`. Created with built-in imagegen from the matching original card, non-destructively. The component shows only the 23–80% vertical band of each plate (with blended margins); title and footer always remain the original card image's pixels, never regenerated text. The headphones card is centered in DOM and visual order. Hovering a penguin shows “Click to play” through the project's shared PortalTooltip; no separate fixed hint is rendered.

Plate prompt: “Use case: precise-object-edit. Edit target: supplied penguin card. Remove ONLY the central penguin and its accessories, replacing the character with seamless matching warm ivory paper texture. Preserve exact canvas framing, dimensions, colors, paper grain, title and bottom English lettering and positions. No new text, no objects, no shadow, no borders. Clean blank middle where the penguin used to be. This is an inpainted background plate for animation.”

Current assets: `penguin-relax-smooth.png`, `penguin-sleepy-smooth.png`, `penguin-hug-smooth.png`. Generated with the built-in imagegen tool, each using the corresponding original sprite as its edit reference. Original card images remain unchanged.

Prompt (one per source): “Edit target: provided penguin sprite. Clean and polish this SAME penguin: preserve exact pose, expression, proportions, silhouette and accessories. Replace distressed grain, speckles, scratches and fuzzy edges with smooth precise rounded contours and perfectly flat solid near-black #111111 and warm cream #FFF8E8 fills. Professional crisp 2D illustration, NOT furry, NOT paper texture, NOT glossy, NOT 3D, no shading, no shadow, no outline halo. Entire full-body penguin centered with same framing. Replace ALL checkerboard background with a uniform pure chroma green #00FF00 background, including holes inside headphones and between limbs. Green is exclusively background, no green reflected light, no green on penguin. No text or extra elements.”

These PNGs intentionally contain a green matte, not standalone transparency. One SVG color matrix removes the green backdrop and neutralizes edge spill at render time. It is specific to these black/cream assets and must not be reused for green artwork. No blur, approximate silhouette clip, or inset mask is used.

Interaction behavior in the conversation empty state: three cards remain in a fixed shallow arc with no character overlap. Hover for 180ms to bring one out; leaving the card or entire illustration must NOT retract it. Hover another card to switch (220ms lets the previous sprite return first). Click an active penguin: headphones perform two rhythmic hops, fish performs one happy hop and a small tilt, sleepy rocks gently with decreasing amplitude. Repeated clicks restart rather than stack animations. Clicking outside, focusing outside, or typing outside returns it without cancelling the user's original action. Tab selects, Enter/Space plays, Escape retracts. Reduced-motion mode disables gestures and transitions.
