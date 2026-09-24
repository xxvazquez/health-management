/** A column width for a multi-column list that fits its longest label on
 * one line, so columns size to their content instead of squeezing long
 * names into two-line slivers. `chrome` is the row's non-text width
 * (padding, leading glyph). Clamped so a list of short names still gets a
 * sensible column, and one very long name wraps rather than claiming the
 * whole row. `ch` resolves against the list's own font size, so give the
 * list the same text size as its rows. */
export function fitColumnWidth(labels: string[], chrome = "3rem", min = 10, max = 22): string {
  const longest = labels.reduce((n, label) => Math.max(n, label.length), 0);
  return `clamp(${min}rem, calc(${longest}ch + ${chrome}), ${max}rem)`;
}
