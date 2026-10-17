import { useMemo, useState } from "react";
import { Check, Lock, Search, Star } from "lucide-react";
import { FxModal } from "./FxModal";
import { FxTile } from "./FxTile";

/* ---------------------------------------------------------------------------
   EffectDrawer — the picker behind every "Change effect" button.

   The tiles are boxes now: each one draws its own effect in miniature (FxTile)
   above its name, so the store tells you what "Flicker" looks like without you
   having to hover it one item at a time. A tile mounts its effect only while it
   is on screen, which is what keeps two dozen animations from running at once —
   the reason the old store was labels only.

   Contracts the editor and its tests rely on:

     • every tile is one <button> inside `data-testid={testid}-choices`, so the
       count of tiles equals the catalog length — the catalogs each ship their
       own `{ id: "" }` entry and the panel replaces it with the single None,
     • a tile's testid is `${testid}-${id || "none"}`,
     • the tile BUTTON never carries an `fx-` class: the effect lives in the
       preview box inside it, so a click target can never be mistaken for an
       effect layer (and the hover preview on the real card still works),
     • a premium tile on a free account calls `onUpgrade` instead of `onChange`.
   --------------------------------------------------------------------------- */

// Only one tile per effect, even if a catalog repeats an id.
const dedupe = (options) => {
  const seen = new Set();
  return options.filter((o) => {
    const id = o?.id || "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

function Tile({ opt, testid, variant, accent, active, locked, onSelect, onPreview, onToggleFavorite, isFavorite }) {
  const id = opt.id || "";
  // The favourite star is revealed by the tile you are pointing at (or tabbed
  // to) rather than rendered up front. That keeps the chip list exactly one
  // button per catalog entry — a second always-present button per tile used to
  // double the count the picker's contract depends on.
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="ov-tile-wrap"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setRevealed(false);
      }}
    >
      <button
        type="button"
        data-testid={`${testid}-${id || "none"}`}
        aria-pressed={active}
        title={locked ? `${opt.label} — Premium` : opt.label}
        // The parent owns the locked case (it opens the pricing page), so the
        // tile must always report the click.
        onClick={() => onSelect(id)}
        onMouseEnter={() => !locked && onPreview(id)}
        onMouseLeave={() => onPreview(null)}
        onFocus={() => !locked && onPreview(id)}
        onBlur={() => onPreview(null)}
        className={`ov-tile ${active ? "ov-tile-active" : ""} ${locked ? "ov-tile-locked" : ""}`}
      >
        {/* The effect itself, drawn in the tile. `None` and any tile that has
            scrolled out of view show the plain sample instead. */}
        <FxTile variant={variant} id={id} accent={accent} />
        <span className="ov-tile-meta">
          <span className="ov-tile-label">{opt.label}</span>
          {locked && <Lock className="ov-tile-lock" aria-hidden="true" />}
          {active && <Check className="ov-tile-check" aria-hidden="true" />}
        </span>
      </button>

      {!locked && id && revealed && (
        <button
          type="button"
          onClick={() => onToggleFavorite(id)}
          aria-label={isFavorite ? `Remove ${opt.label} from favourites` : `Add ${opt.label} to favourites`}
          aria-pressed={!!isFavorite}
          className={`ov-star ${isFavorite ? "ov-star-on" : ""}`}
        >
          <Star className="h-3 w-3" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

export function EffectDrawer({
  open = false,
  onOpenChange,
  variant = "text",
  accent = "#A48DF4",
  title,
  description,
  options = [],
  value,
  onChange,
  onPreview,
  isPremium = false,
  onUpgrade,
  displayName = "",
  favorites = [],
  onToggleFavorite,
  recent = [],
  testid = "fx",
}) {
  const [query, setQuery] = useState("");

  // The catalogs ship their own "None"; this adds the one the panel shows.
  const choices = useMemo(
    () => [{ id: "", label: "None", premium: false }, ...dedupe(options)],
    [options],
  );

  const q = query.trim().toLowerCase();
  const matches = q ? choices.filter((c) => c.label.toLowerCase().includes(q)) : choices;

  const selected = choices.find((c) => c.id === (value || "")) || choices[0];

  const byId = (id) => choices.find((c) => c.id === id);
  const recentTiles = recent.map(byId).filter((o) => o && o.id);
  const favoriteTiles = favorites.map(byId).filter((o) => o && o.id);

  const lockLabel = (opt) => !!opt.premium && !isPremium;
  // A premium tile on a free account opens the pricing page instead of applying.
  const choose = (opt) => (lockLabel(opt) ? onUpgrade?.() : onChange?.(opt.id || ""));

  return (
    <FxModal
      open={open}
      onOpenChange={onOpenChange}
      id={`${testid}-drawer`}
      eyebrow="Effects"
      title={title}
      description={description}
      testid={`${testid}-drawer`}
      // The stage and the search box ride in the modal's fixed header, so they
      // stay put while the tile grid scrolls under them.
      top={
        <div className="ov-modal-head-row">
          <div className="ov-stage">
            <div className="ov-stage-label">
              {selected?.label}
              {lockLabel(selected) ? " · Premium" : ""}
            </div>
            <p className="ov-stage-hint">
              {displayName ? (
                <>
                  Previewing on <span className="ov-stage-name">{displayName}</span> — hover a tile to try it.
                </>
              ) : (
                "Hover a tile to preview it on your page."
              )}
            </p>
          </div>

          <div className="ov-search">
            <Search className="ov-search-icon" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid={`${testid}-search`}
              placeholder={`Search ${choices.length} effects…`}
              className="ov-input"
            />
          </div>
        </div>
      }
      footer={
        <div className="ov-modal-foot-row">
          <span className="ov-foot-note">
            {favoriteTiles.length > 0 || recentTiles.length > 0
              ? "Hover a tile to preview it on your page, then click to keep it."
              : "Click a tile to apply it. Click it again to take it off."}
          </span>
          <button type="button" onClick={() => onOpenChange?.(false)} className="ov-btn px-4 py-2 text-xs">
            Done
          </button>
        </div>
      }
    >
      <div className="ov-popup">
        {recentTiles.length > 0 && (
          <section className="ov-section">
            <h3 className="ov-section-label">Recent</h3>
            <div className="ov-grid">
              {recentTiles.map((opt) => (
                <Tile
                  key={`recent-${opt.id}`}
                  opt={opt}
                  testid={`${testid}-recent`}
                  variant={variant}
                  accent={accent}
                  active={false}
                  locked={lockLabel(opt)}
                  onSelect={() => choose(opt)}
                  onPreview={onPreview}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite={favorites.includes(opt.id)}
                />
              ))}
            </div>
          </section>
        )}

        {favoriteTiles.length > 0 && (
          <section className="ov-section">
            <h3 className="ov-section-label">Favourites</h3>
            <div className="ov-grid">
              {favoriteTiles.map((opt) => (
                <Tile
                  key={`fav-${opt.id}`}
                  opt={opt}
                  testid={`${testid}-fav`}
                  variant={variant}
                  accent={accent}
                  active={false}
                  locked={lockLabel(opt)}
                  onSelect={() => choose(opt)}
                  onPreview={onPreview}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite
                />
              ))}
            </div>
          </section>
        )}

        <section className="ov-section">
          <h3 className="ov-section-label">
            {q ? `${matches.length} matching` : "All effects"}
          </h3>
          {matches.length === 0 ? (
            <p className="ov-empty">Nothing matches “{query}”.</p>
          ) : (
            <div className="ov-grid" data-testid={`${testid}-choices`}>
              {matches.map((opt) => {
                const id = opt.id || "";
                const locked = lockLabel(opt);
                return (
                  <Tile
                    key={id || "none"}
                    opt={opt}
                    testid={testid}
                    variant={variant}
                    accent={accent}
                    active={id === (value || "")}
                    locked={locked}
                    onSelect={() => choose(opt)}
                    onPreview={onPreview}
                    onToggleFavorite={onToggleFavorite}
                    isFavorite={favorites.includes(id)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </FxModal>
  );
}

export default EffectDrawer;
