/* The Discord decoration catalogue count.
 *
 * The decorations themselves live in public/decorations/effects.json — a
 * curated list in the shape the open Discord Avatar Decoration catalogue
 * publishes ({ id, label, url }, the url pointing at Discord's own preset
 * CDN). The decoration picker loads that file at run time; this constant is
 * the marketing copy's number. It is pinned by effects-frames.test.js, which
 * counts the catalogue file itself, so the two cannot drift apart.
 *
 * The old library of 671 numbered PNGs is retired: nothing in the picker or
 * the card offers it any more, and old profiles that still wear one keep
 * rendering through the same frameSrc path they always did.
 */
export const FRAME_COUNT = 195;
