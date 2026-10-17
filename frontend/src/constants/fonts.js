// ---------------------------------------------------------------------------
// Font catalog — single source of truth for the Editor's font picker, the
// Google Fonts <link> loader and the profile renderer.
//
// `free` ids (15 of them) are always available. Everything else is a Premium
// font: picking one routes a free user to the pricing page, same as effects.
//
// Every Google font listed here is ALSO requested in fontsHref() so the family
// is guaranteed loaded on any page that can render it (editor + public profile).
// system-ui / Arial / Georgia etc. are safe fonts — no loading needed.
// ---------------------------------------------------------------------------

export const FONTS = [
  // ---- Sans Serif ----
  { name: "Inter",            stack: "'Inter', sans-serif",            free: true, category: "Sans Serif" },
  { name: "Montserrat",       stack: "'Montserrat', sans-serif",       free: true, category: "Sans Serif" },
  { name: "Poppins",          stack: "'Poppins', sans-serif",          free: true, category: "Sans Serif" },
  { name: "Outfit",           stack: "'Outfit', sans-serif",           free: true, category: "Sans Serif" },
  { name: "system-ui",        stack: "system-ui, sans-serif",          free: true, category: "Sans Serif" },
  { name: "Quicksand",        stack: "'Quicksand', sans-serif",        category: "Sans Serif" },
  { name: "Comfortaa",        stack: "'Comfortaa', sans-serif",        category: "Sans Serif" },
  { name: "Baloo 2",          stack: "'Baloo 2', sans-serif",          category: "Sans Serif" },
  { name: "Fredoka",          stack: "'Fredoka', sans-serif",          category: "Sans Serif" },
  { name: "Manrope",          stack: "'Manrope', sans-serif",          category: "Sans Serif" },
  { name: "Lexend",           stack: "'Lexend', sans-serif",           category: "Sans Serif" },
  { name: "Sora",             stack: "'Sora', sans-serif",             category: "Sans Serif" },
  { name: "Urbanist",         stack: "'Urbanist', sans-serif",         category: "Sans Serif" },
  { name: "Epilogue",         stack: "'Epilogue', sans-serif",         category: "Sans Serif" },
  { name: "Work Sans",        stack: "'Work Sans', sans-serif",        category: "Sans Serif" },
  { name: "DM Sans",          stack: "'DM Sans', sans-serif",          category: "Sans Serif" },
  { name: "Plus Jakarta Sans",stack: "'Plus Jakarta Sans', sans-serif",category: "Sans Serif" },

  // ---- Display ----
  { name: "Unbounded",        stack: "'Unbounded', sans-serif",        free: true, category: "Display" },
  { name: "Syne",             stack: "'Syne', sans-serif",             free: true, category: "Display" },
  { name: "Space Grotesk",    stack: "'Space Grotesk', sans-serif",    free: true, category: "Display" },
  { name: "Bebas Neue",       stack: "'Bebas Neue', sans-serif",       free: true, category: "Display" },
  { name: "Oswald",           stack: "'Oswald', sans-serif",           free: true, category: "Display" },
  { name: "Clash Display",    stack: "'Clash Display', sans-serif",    category: "Display" },
  { name: "Cabinet Grotesk",  stack: "'Cabinet Grotesk', sans-serif",  category: "Display" },
  { name: "General Sans",     stack: "'General Sans', sans-serif",     category: "Display" },
  { name: "Satoshi",          stack: "'Satoshi', sans-serif",          category: "Display" },
  { name: "Ranade",           stack: "'Ranade', sans-serif",           category: "Display" },
  { name: "Chillax",          stack: "'Chillax', sans-serif",          category: "Display" },
  { name: "Author",           stack: "'Author', sans-serif",           category: "Display" },
  { name: "Archivo Black",    stack: "'Archivo Black', sans-serif",    category: "Display" },
  { name: "Anton",            stack: "'Anton', sans-serif",            category: "Display" },
  { name: "Bricolage Grotesque", stack: "'Bricolage Grotesque', sans-serif", category: "Display" },
  { name: "Righteous",        stack: "'Righteous', sans-serif",        category: "Display" },
  { name: "Paytone One",      stack: "'Paytone One', sans-serif",      category: "Display" },
  { name: "Audiowide",        stack: "'Audiowide', cursive",           category: "Display" },
  { name: "Syncopate",        stack: "'Syncopate', sans-serif",        category: "Display" },
  { name: "Russo One",        stack: "'Russo One', sans-serif",        category: "Display" },

  // ---- Serif ----
  { name: "Playfair Display", stack: "'Playfair Display', serif",      free: true, category: "Serif" },
  { name: "Lora",             stack: "'Lora', serif",                  free: true, category: "Serif" },
  { name: "Georgia",          stack: "Georgia, serif",                 free: true, category: "Serif" },
  { name: "Sentient",         stack: "'Sentient', serif",              category: "Serif" },
  { name: "Zodiak",           stack: "'Zodiak', serif",                category: "Serif" },
  { name: "Melodrama",        stack: "'Melodrama', serif",             category: "Serif" },
  { name: "Instrument Serif", stack: "'Instrument Serif', serif",      category: "Serif" },
  { name: "DM Serif Display", stack: "'DM Serif Display', serif",      category: "Serif" },
  { name: "Playfair Display SC", stack: "'Playfair Display SC', serif", category: "Serif" },
  { name: "Crimson Pro",      stack: "'Crimson Pro', serif",           category: "Serif" },
  { name: "Fraunces",         stack: "'Fraunces', serif",              category: "Serif" },
  { name: "Cormorant Garamond", stack: "'Cormorant Garamond', serif",  category: "Serif" },

  // ---- Handwriting / Script ----
  { name: "Sniglet",          stack: "'Sniglet', cursive",             category: "Handwriting" },
  { name: "Pacifico",         stack: "'Pacifico', cursive",            category: "Handwriting" },
  { name: "Dancing Script",   stack: "'Dancing Script', cursive",      category: "Handwriting" },
  { name: "Great Vibes",      stack: "'Great Vibes', cursive",         category: "Handwriting" },
  { name: "Satisfy",          stack: "'Satisfy', cursive",             category: "Handwriting" },
  { name: "Caveat",           stack: "'Caveat', cursive",              category: "Handwriting" },
  { name: "Amatic SC",        stack: "'Amatic SC', cursive",           category: "Handwriting" },
  { name: "Permanent Marker", stack: "'Permanent Marker', cursive",    category: "Handwriting" },
  { name: "Kalam",            stack: "'Kalam', cursive",               category: "Handwriting" },
  { name: "Sacramento",       stack: "'Sacramento', cursive",          category: "Handwriting" },

  // ---- Monospace ----
  { name: "JetBrains Mono",   stack: "'JetBrains Mono', monospace",    free: true, category: "Monospace" },
  { name: "Courier New",      stack: "'Courier New', monospace",       free: true, category: "Monospace" },
  { name: "Orbitron",         stack: "'Orbitron', sans-serif",         category: "Monospace" },
  { name: "Press Start 2P",   stack: "'Press Start 2P', cursive",      category: "Monospace" },
  { name: "Silkscreen",       stack: "'Silkscreen', sans-serif",       category: "Monospace" },
  { name: "Major Mono Display", stack: "'Major Mono Display', monospace", category: "Monospace" },
  { name: "Fira Code",        stack: "'Fira Code', monospace",         category: "Monospace" },
  { name: "Space Mono",       stack: "'Space Mono', monospace",        category: "Monospace" },
  { name: "VT323",            stack: "'VT323', monospace",             category: "Monospace" },
  { name: "Share Tech Mono",  stack: "'Share Tech Mono', monospace",   category: "Monospace" },
];

export const FREE_FONTS = FONTS.filter((f) => f.free);

// Resolves any saved value — a stored font's display name or a raw CSS stack —
// to the CSS font-family to actually paint. Falls back to the first free font.
export const fontStackOf = (value) => {
  if (!value) return "";
  const byName = FONTS.find((f) => f.name.toLowerCase() === String(value).toLowerCase());
  if (byName) return byName.stack;
  if (FONTS.some((f) => f.stack === value)) return value;
  return "";
};

// The one page-load <link> that guarantees every Google-hosted font in the
// catalog is available. Safe fonts (system/Georgia/Courier) and the Fontshare
// premium set are intentionally absent — Fontshare fonts degrade to their
// fallback stack unless self-hosted later.
export const fontsHref = () => {
  const google = FONTS.filter(
    (f) => f.stack.startsWith("'") && !fontsHref.EXCLUDED.includes(f.name),
  );
  const families = google.map((f) => `family=${f.name.replace(/ /g, "+")}:wght@400;500;600;700;800;900`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
};
fontsHref.EXCLUDED = [
  // Fontshare (Indian Type Foundry) families — not on Google Fonts.
  "Clash Display", "Cabinet Grotesk", "General Sans", "Satoshi", "Ranade",
  "Chillax", "Author", "Sentient", "Zodiak", "Melodrama",
  // Safe system fonts — nothing to download.
  "Courier New",
];

// Google Fonts can only be requested once; the blocked duplicate happened when
// the public profile and the editor each appended a <link> on mount.
let fontsInjected = false;
export const ensureFontsLoaded = () => {
  if (fontsInjected) return;
  fontsInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = fontsHref();
  document.head.appendChild(link);
};
