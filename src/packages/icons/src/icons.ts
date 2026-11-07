/**
 * The Meandros icon set. Every icon is drawn on a 24-unit grid with straight
 * lines only, square caps and miter joins, like the Greek key. Each name is
 * the Latin or Greek idea the drawing refers to; `use` says where Lustre
 * shows it.
 */
export const ICONS = {
  aversio: {
    d: "M3 9L7 14H17L21 9 M8 14L6 18 M12 14V19 M16 14L18 18",
    meaning:
      "Turning the eyes away from what should not be seen: a closed eye.",
    title: "Aversio",
    use: "Not interested",
  },
  clepsydra: {
    d: "M5 3H19 M5 21H19 M7 3V7L12 12L7 17V21 M17 3V7L12 12L17 17V21",
    meaning:
      "The water clock that timed speeches in the Athenian courts: a vessel that empties as the work is done.",
    title: "Clepsydra",
    use: "Work in progress",
  },
  damnatio: {
    d: "M6 7H18V17H6Z M6 9L3 12L6 15 M18 9L21 12L18 15 M9 12H15 M8 16L16 8",
    meaning:
      "Damnatio memoriae: a name chiselled off a tabula ansata, the Roman inscription tablet.",
    title: "Damnatio",
    use: "Blocked accounts",
  },
  lustratio: {
    d: "M12 3L18 11V15L15 20H9L6 15V11Z M10 15H13",
    meaning:
      "Aqua lustralis, the water of the cleansing rite: a cut-stone drop.",
    title: "Lustratio",
    use: "Purify, share",
  },
  meandros: {
    d: "M6 4V20H20V10H10V15H13",
    meaning: "The Greek key folded into the letter L: the Lustre mark.",
    title: "Meandros",
    use: "Lustre",
  },
  ordo: {
    d: "M5 5H19 M5 19H19 M7 5V9H17V5 M7 10V14H17V10 M7 15V19H17V15",
    meaning: "Column drums stacked in order, waiting to be set.",
    title: "Ordo",
    use: "Queue",
  },
  pollice: {
    d: "M17 3H21V14H17Z M17 4H7L4 13H10V21H13L17 14",
    meaning:
      "The turned thumb of the arena crowd, made famous as a death sentence by Gerome's painting.",
    title: "Pollice verso",
    use: "Block",
  },
  restitutio: {
    d: "M8 5L4 9L8 13 M4 9H18V19H10V14H14",
    meaning: "Restoring what was taken: a meander that turns back on itself.",
    title: "Restitutio",
    use: "Undo",
  },
  scutum: {
    d: "M7 3H17V21H7Z M12 3V10 M12 14V21 M10 10H14V14H10Z",
    meaning: "The legionary's rectangular shield with its central boss.",
    title: "Scutum",
    use: "Settings and safety",
  },
  tacita: {
    d: "M5 3H19V13L12 21L5 13Z M8 9H10.5 M13.5 9H16 M10 14.5H14",
    meaning:
      "Dea Tacita, the Roman goddess of silence: a mask with a closed mouth.",
    title: "Tacita",
    use: "Mute",
  },
  volumen: {
    d: "M4 5H20 M4 19H20 M6 5V19 M18 5V19 M9 10H15 M9 14H13",
    meaning: "The papyrus scroll on which lists of names were kept.",
    title: "Volumen",
    use: "Lists",
  },
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export const ICON_VIEWBOX = "0 0 24 24";

/** Stroke settings shared by every renderer. */
export const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "square",
  "stroke-linejoin": "miter",
  "stroke-width": "2",
} as const;
