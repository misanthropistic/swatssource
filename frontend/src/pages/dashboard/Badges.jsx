import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BADGE_CATALOG, badgeMeta } from "@/constants/badges";
import { BadgeChip } from "@/components/BadgeChip";
import { Paintbrush, Check, Lock, Plus, X, Shield, Upload, Eye, EyeOff, Loader2, Search } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/lib/notify";
import { useEditGate } from "@/hooks/useEditGate";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/ColorPicker";
import { SmartSelect } from "@/components/ui-shared/SmartSelect";
import { PageHeader, EmptyState } from "@/components/ui-shared/PageUI";
import { PremiumGate } from "@/components/ui-shared/PremiumGate";

/* A faithful preview of the profile card's badge row, driven by the same
   settings the card reads, so a change is visible here before it is saved. */
function BadgePreviewRow({ ids, glowColor = "", glowIntensity = 60, glow = true, overlay = false, overlayColor = "", overlayStrength = 60 }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {ids.map((id) => (
        <BadgeChip
          key={id}
          id={id}
          glowColor={glowColor}
          glowIntensity={glowIntensity}
          glow={glow}
          overlay={overlay}
          overlayColor={overlayColor}
          overlayStrength={overlayStrength}
        />
      ))}
    </div>
  );
}

export default function Badges() {
  const { user, setUser } = useAuth();
  const gate = useEditGate();
  const [catalog, setCatalog] = useState(BADGE_CATALOG);
  const [showPaintModal, setShowPaintModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Set to the feature name when a premium-only action is attempted, which pops
  // the upsell dialog instead of navigating away from the page.
  const [premiumFeature, setPremiumFeature] = useState(null);
  const [iconUploading, setIconUploading] = useState(false);

  // Custom Badge Form State
  const [customBadge, setCustomBadge] = useState({
    name: "",
    desc: "",
    icon_url: "",
    color: "#A48DF4",
    glow: "#A48DF466",
  });

  const [paintSettings, setPaintSettings] = useState({
    glow: user?.profile?.badge_glow !== false,
    glow_color: user?.profile?.badge_glow_color || "#A48DF4",
    glow_intensity: user?.profile?.badge_glow_intensity ?? 60,
    // The colour laid over every badge, and how much of it. Off unless the owner
    // turns it on: an overlay on by default would repaint everybody's badges.
    overlay: user?.profile?.badge_overlay === true,
    overlay_color: user?.profile?.badge_overlay_color || "#A48DF4",
    overlay_strength: user?.profile?.badge_overlay_strength ?? 60,
  });

  // Whether the badges show on the card at all.
  const [showBadges, setShowBadges] = useState(user?.profile?.show_badges !== false);

  const [equippedList, setEquippedList] = useState(
    user?.equipped_badges?.length ? user.equipped_badges : (user?.badges || [])
  );
  const [dragIndex, setDragIndex] = useState(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("owned");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    api.get("/badges/catalog").then(({ data }) => { if (Array.isArray(data)) setCatalog(data); }).catch(() => {});
  }, []);

  // Catalog names are better than raw ids ("bug_hunter" → "Bug Hunter").
  // `badgeMeta`, not BADGE_META, so a seasonal badge (halloween_2026) resolves
  // to its event's label and picture even though no registry lists that year.
  const nameOf = (id) => catalog.find((c) => c.id === id)?.name || badgeMeta(id)?.label || id.replace(/_/g, " ");

  const owned = new Set(user?.badges || []);
  const equippedSet = new Set(equippedList);
  const isPremium = user?.tier === "premium" || user?.tier === "admin" || user?.is_owner;

  /* Two settings, both account-wide: how the row glows, and the colour laid over
     the art. There is deliberately nothing per-badge and nothing that could put
     a box behind a badge. */
  const globalChip = {
    glow: paintSettings.glow,
    glowColor: paintSettings.glow_color,
    glowIntensity: paintSettings.glow_intensity,
    overlay: paintSettings.overlay,
    overlayColor: paintSettings.overlay_color,
    overlayStrength: paintSettings.overlay_strength,
  };

  // Search + sort + filter for the catalog grid. "Owned first" is the default
  // because the question a user actually has here is "what can I equip?".
  /* Badges outside the platform catalogue — the Discord set — still belong to the
     people who were granted them. They are added to the grid for those users, and
     only for them, so a granted Discord badge can actually be equipped; a badge
     nobody owns does not turn the grid into a wall of locked entries. */
  const gridCatalog = useMemo(() => {
    const known = new Set(catalog.map((c) => c.id));
    const extra = [...new Set([...(user?.badges || []), ...equippedList])]
      .filter((id) => id && !known.has(id) && badgeMeta(id))
      .map((id) => ({
        id,
        name: badgeMeta(id).label || id.replace(/_/g, " "),
        desc: badgeMeta(id).art?.desc || "Granted badge",
        type: "mod",
        group: badgeMeta(id).art?.group,
      }));
    return extra.length ? [...catalog, ...extra] : catalog;
  }, [catalog, user?.badges, equippedList]);

  const visibleBadges = useMemo(() => {
    const ownedSet = new Set(user?.badges || []);
    const eqSet = new Set(equippedList);
    const q = query.trim().toLowerCase();

    let list = gridCatalog.filter((b) => {
      const name = String(b.name || badgeMeta(b.id)?.label || b.id).toLowerCase();
      return !q || name.includes(q) || String(b.id).toLowerCase().includes(q);
    });

    if (filterBy === "owned") list = list.filter((b) => ownedSet.has(b.id));
    else if (filterBy === "equipped") list = list.filter((b) => eqSet.has(b.id));
    else if (filterBy === "locked") list = list.filter((b) => !ownedSet.has(b.id));

    const rank = (b) => (eqSet.has(b.id) ? 0 : ownedSet.has(b.id) ? 1 : 2);
    if (sortBy === "owned") list = [...list].sort((a, b) => rank(a) - rank(b));
    else if (sortBy === "az")
      list = [...list].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    return list;
  }, [gridCatalog, query, sortBy, filterBy, equippedList, user?.badges]);

  const toggleEquip = async (badgeId) => {
    if (gate.guard("equipping badges")) return;
    let nextList;
    if (equippedSet.has(badgeId)) {
      nextList = equippedList.filter((b) => b !== badgeId);
    } else {
      nextList = [...equippedList, badgeId];
    }
    setEquippedList(nextList);

    try {
      const { data } = await api.put("/me/profile", { equipped_badges: nextList });
      setUser(data);
      toast.success(equippedSet.has(badgeId) ? "Badge unequipped" : "Badge equipped to profile card!");
    } catch {
      toast.error("Failed to update equipped badges");
    }
  };

  // Drag-to-reorder for the equipped badge strip. This order is exactly what the
  // profile card renders, so it is persisted as soon as it changes.
  const reorderEquipped = async (from, to) => {
    if (gate.guard("reordering badges")) return;
    if (from == null || from === to) return;
    const next = [...equippedList];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setEquippedList(next);
    try {
      const { data } = await api.put("/me/profile", { equipped_badges: next });
      setUser(data);
      toast.success("Badge order updated");
    } catch {
      toast.error("Failed to reorder badges");
    }
  };

  /* The whole of badge styling: the glow, and the colour over the art. A save
     also clears the keys the old customiser wrote, so a profile cannot keep
     carrying a plate, a tint or a per-badge override that nothing reads. */
  const savePaintSettings = async () => {
    if (gate.guard("saving badge styling")) return;
    try {
      const updatedProfile = {
        ...user.profile,
        badge_glow: paintSettings.glow,
        badge_glow_color: paintSettings.glow_color,
        badge_glow_intensity: paintSettings.glow_intensity,
        badge_overlay: paintSettings.overlay,
        badge_overlay_color: paintSettings.overlay_color,
        badge_overlay_strength: paintSettings.overlay_strength,
        show_badges: showBadges,
        // Retired: plates, the old fixed wash, recolouring, thickness, size,
        // one-pill, row overlap, and per-badge overrides.
        badge_style: "default",
        badge_size: "lg",
        badge_icon_weight: "normal",
        badge_overlay_tint: "",
        badge_recolor_enabled: false,
        badge_overrides: {},
      };
      const { data } = await api.put("/me/profile", updatedProfile);
      setUser(data);
      toast.success("Badge styling updated!");
      setShowPaintModal(false);
    } catch {
      toast.error("Failed to save badge styling");
    }
  };

  const handleIconUpload = async (file) => {
    if (!file) return;
    setIconUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "asset");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setCustomBadge({ ...customBadge, icon_url: data.url });
      toast.success("Custom badge icon uploaded!");
    } catch {
      toast.error("Icon upload failed");
    }
    setIconUploading(false);
  };

  const handleCreateCustomBadge = async (e) => {
    e.preventDefault();
    if (gate.guard("creating a badge")) return;
    if (!customBadge.name.trim()) {
      toast.error("Badge name is required");
      return;
    }
    try {
      const newBadgeId = `custom_${customBadge.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      const newBadges = [...(user.badges || []), newBadgeId];
      const newEquipped = [...equippedList, newBadgeId];
      const newCustomList = [...(user.profile?.custom_badges_data || []), { id: newBadgeId, ...customBadge }];

      const { data } = await api.put("/me/profile", {
        badges: newBadges,
        equipped_badges: newEquipped,
        custom_badges_data: newCustomList,
      });
      setUser(data);
      setEquippedList(newEquipped);
      toast.success(`Custom badge "${customBadge.name}" created & equipped!`);
      setShowCreateModal(false);
      setCustomBadge({ name: "", desc: "", icon_url: "", color: "#A48DF4", glow: "#A48DF466" });
    } catch {
      toast.error("Failed to create custom badge");
    }
  };

  return (
    <div className="space-y-5" data-testid="badges-page">
      <PageHeader
        icon={Shield}
        title="Badges & Achievements"
        subtitle="Earn badges automatically through activity, get verified by staff, or craft custom badges with Premium."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPaintModal(true)}
            className="px-3.5 py-2.5 rounded-xl glass hover:bg-white/10 text-brand-300 text-xs font-semibold flex items-center gap-2 transition"
            data-testid="badge-style-open"
            title="Badge Style"
          >
            <Paintbrush className="w-4 h-4" /> Badge Style
          </button>
          <button
            onClick={() => (isPremium ? setShowCreateModal(true) : setPremiumFeature("Custom badges"))}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold flex items-center gap-2 hover:brightness-110 transition shadow-[0_0_20px_rgba(164, 141, 244,0.3)]"
          >
            {!isPremium && <Lock className="w-3.5 h-3.5 text-amber-400" />}
            <Plus className="w-4 h-4" /> Create Custom Badge
          </button>
          </div>
        }
      />

      {/* Catalog controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="badges-search"
            placeholder="Search badges…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none transition-colors duration-200 placeholder:text-zinc-600 focus:border-brand-500/50"
          />
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {[["all", "All"], ["owned", "Owned"], ["equipped", "Equipped"], ["locked", "Locked"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilterBy(id)}
              data-testid={`badges-filter-${id}`}
              aria-pressed={filterBy === id}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                filterBy === id ? "bg-brand-500/20 text-brand-100" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <SmartSelect
          testid="badges-sort"
          ariaLabel="Sort badges"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "owned", label: "Owned first" },
            { value: "az", label: "A–Z" },
            { value: "id", label: "Default order" },
          ]}
        />
      </div>

      {/* Live preview — the equipped badges drawn exactly as the profile card
          draws them, so a style change is visible before it is saved. */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5" data-testid="badge-preview">
        <div className="mb-3 flex items-center justify-between gap-3">            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Live preview</div>
          <span className="text-[11px] text-zinc-500">
            How visitors see your badges · glow and overlay
          </span>
        </div>
        {(equippedList.length ? equippedList : (user?.badges || [])).length ? (
          <div className="flex items-center justify-center rounded-xl border border-white/5 bg-black/20 px-4 py-6">
            <BadgePreviewRow
              ids={equippedList.length ? equippedList : (user?.badges || [])}
              glow={paintSettings.glow}
              glowColor={paintSettings.glow_color}
              glowIntensity={paintSettings.glow_intensity}
              overlay={paintSettings.overlay}
              overlayColor={paintSettings.overlay_color}
              overlayStrength={paintSettings.overlay_strength}
            />
          </div>
        ) : (
          <p className="py-6 text-center text-[11px] text-zinc-500">Equip a badge to see it here.</p>
        )}
      </div>

      {/* Equipped order — drag a badge to reposition it on the card */}
      {equippedList.length > 1 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" data-testid="equipped-order">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Equipped order</div>
            <span className="text-[11px] text-zinc-500">Drag, or focus a badge and press ← → — the card shows them left to right</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {equippedList.map((id, i) => {
              return (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  draggable
                  data-testid={`equipped-badge-${i}`}
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { reorderEquipped(dragIndex, i); setDragIndex(null); }}
                  onDragEnd={() => setDragIndex(null)}
                  onKeyDown={(e) => {
                    // Keyboard equivalent of the drag, so reordering is not
                    // pointer-only.
                    if (e.key === "ArrowLeft") { e.preventDefault(); reorderEquipped(i, i - 1); }
                    else if (e.key === "ArrowRight") { e.preventDefault(); reorderEquipped(i, i + 1); }
                  }}
                  title={`${nameOf(id)} — drag, or use ← → to reorder`}
                  className={`flex cursor-grab items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition active:cursor-grabbing ${
                    dragIndex === i ? "border-brand-500/60 bg-brand-500/20" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <BadgeChip id={id} {...globalChip} />
                  <span>{nameOf(id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Badges Grid */}
      <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          Showing {visibleBadges.length} of {gridCatalog.length} badges
        </span>
        <span>
          {owned.size} owned · {equippedList.length} equipped
        </span>
      </div>
      {visibleBadges.length === 0 ? (
        <div className="glass rounded-3xl">
          <EmptyState icon={Search} title="No badges match" hint="Try a different search or clear the filter." />
        </div>
      ) : (
      <div className="grid sm:grid-cols-2 gap-3.5">
        {visibleBadges.map((b) => {
          const M = badgeMeta(b.id) || {};
          const isOwned = owned.has(b.id);
          const isEquipped = equippedSet.has(b.id);

          return (
            <div
              key={b.id}
              className={`group relative p-4 rounded-2xl border transition duration-300 flex items-center justify-between gap-4 ${
                isOwned
                  ? "glass border-brand-500/30 bg-gradient-to-r from-brand-500/[0.08] via-white/[0.02] to-transparent hover:border-brand-500/60 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                  : "bg-white/[0.02] border-white/10 opacity-75 hover:opacity-90 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className={`relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300 ${
                  isOwned
                    ? "border-brand-500/30 bg-gradient-to-b from-brand-500/15 to-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_20px_rgba(164,141,244,0.15)] group-hover:border-brand-400/60 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(164,141,244,0.3)]"
                    : "border-white/10 bg-white/[0.03] group-hover:border-white/20"
                }`}>
                  <BadgeChip
                    id={b.id}
                    meta={M}
                    {...globalChip}
                    size="lg"
                    className="shrink-0 transition-transform duration-300 group-hover:scale-115"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                    <span className="font-display tracking-tight text-sm text-zinc-100 group-hover:text-white transition-colors">{b.name || M.label || b.id}</span>
                    {isOwned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
                        <Check className="h-2.5 w-2.5" /> Owned
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1 group-hover:text-zinc-300 transition-colors">{b.description || M.desc}</p>
                </div>
              </div>

              {/* One action: equip it, or take it off the card. */}
              {isOwned ? (
                <button
                  onClick={() => toggleEquip(b.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                    isEquipped
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                      : "bg-white/5 text-zinc-300 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20"
                  } px-3.5 py-1.5`}
                >
                  {isEquipped ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" /> Equipped
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-zinc-400" /> Equip
                    </>
                  )}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}

              {/* Tooltip Box */}
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 animate-in fade-in duration-150">
                <div className="px-3 py-1.5 rounded-xl bg-black/95 backdrop-blur-md border border-white/15 text-xs text-white shadow-2xl max-w-xs text-center">
                  <div className="font-bold text-brand-300">{b.name || M.label}</div>
                  <div className="text-[10px] text-zinc-300 mt-0.5">{b.description || M.desc}</div>
                </div>
                <div className="w-2 h-2 bg-black/95 rotate-45 -mt-1 border-r border-b border-white/15" />
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Global Paint Styling Modal */}
      <PremiumGate
        open={!!premiumFeature}
        feature={premiumFeature}
        onClose={() => setPremiumFeature(null)}
      />

      {showPaintModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPaintModal(false); }}
        >
          <div className="bg-[#0A0A0D]/95 backdrop-blur-2xl rounded-3xl p-5 max-w-md w-full relative border border-white/15 shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(164, 141, 244,0.15)] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Paintbrush className="w-5 h-5 text-brand-400" />
                <h3 className="font-display text-base font-bold text-zinc-100">Badge Style</h3>
              </div>
              <button onClick={() => setShowPaintModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              {/* Two settings and nothing else: a badge is its own picture, so
                  there is no fill, plate or outline to configure — the glow, and
                  the overlay that recolours the art without hiding it. */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <span className="text-xs font-semibold text-zinc-300">Glow</span>
                <Switch
                  data-testid="badge-glow-toggle"
                  checked={paintSettings.glow}
                  onCheckedChange={(v) => setPaintSettings({ ...paintSettings, glow: v })}
                  className="data-[state=checked]:bg-brand-500"
                />
              </label>

              <ColorPicker label="Glow Color" value={paintSettings.glow_color} onChange={(v) => setPaintSettings({ ...paintSettings, glow_color: v })} />
              
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-1">
                  <span>Glow Intensity</span>
                  <span className="font-mono2 text-brand-400">{paintSettings.glow_intensity}%</span>
                </div>
                <Slider
                  data-testid="glow-intensity-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={[paintSettings.glow_intensity]}
                  onValueChange={([v]) => setPaintSettings({ ...paintSettings, glow_intensity: v })}
                  className="[&_[role=slider]]:border-brand-400/60 [&_[role=slider]]:bg-brand-500 [&_.absolute]:bg-brand-500"
                  aria-label="Badge glow intensity"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <span className="text-xs font-semibold text-zinc-300">Overlay</span>
                <Switch
                  data-testid="badge-overlay-toggle"
                  checked={paintSettings.overlay}
                  onCheckedChange={(v) => setPaintSettings({ ...paintSettings, overlay: v })}
                  className="data-[state=checked]:bg-brand-500"
                />
              </label>

              <ColorPicker label="Overlay Color" value={paintSettings.overlay_color} onChange={(v) => setPaintSettings({ ...paintSettings, overlay_color: v })} />

              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-1">
                  <span>Overlay Strength</span>
                  <span className="font-mono2 text-brand-400">{paintSettings.overlay_strength}%</span>
                </div>
                <Slider
                  data-testid="badge-overlay-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={[paintSettings.overlay_strength]}
                  onValueChange={([v]) => setPaintSettings({ ...paintSettings, overlay_strength: v })}
                  className="[&_[role=slider]]:border-brand-400/60 [&_[role=slider]]:bg-brand-500 [&_.absolute]:bg-brand-500"
                  aria-label="Badge overlay strength"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                  Lays one colour over every badge and blends it in, so the badge takes the hue while the artwork
                  underneath stays readable. Nothing is drawn behind it — the overlay only ever paints the badge's
                  own pixels.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between text-xs text-zinc-300">
                <span>Show badges on my profile card</span>
                <Switch checked={showBadges} onCheckedChange={setShowBadges} className="data-[state=checked]:bg-brand-500" />
              </label>

              <div className="pt-3 flex justify-end">
                <button
                  onClick={savePaintSettings}
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition"
                >
                  Save Badge Styling
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Badge Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="bg-[#0A0A0D]/95 backdrop-blur-2xl rounded-3xl p-5 max-w-md w-full relative border border-white/15 shadow-[0_25px_90px_rgba(0,0,0,0.95),0_0_40px_rgba(164, 141, 244,0.15)] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-400" />
                <h3 className="font-display text-base font-bold text-zinc-100">Create Premium Custom Badge</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomBadge} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Badge Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Creator, Top Supporter"
                  value={customBadge.name}
                  onChange={(e) => setCustomBadge({ ...customBadge, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Granted for taking part in the summer event"
                  value={customBadge.desc}
                  onChange={(e) => setCustomBadge({ ...customBadge, desc: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-100 outline-none focus:border-brand-500/50"
                />
              </div>

              {/* Upload Badge Icon Image */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Upload Badge Icon</label>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {customBadge.icon_url ? (
                      <img src={fileUrl(customBadge.icon_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <label className="flex-1 px-3.5 py-2 rounded-xl glass hover:bg-white/10 text-xs font-semibold text-zinc-300 cursor-pointer flex items-center justify-center gap-2 border border-white/10">
                    {iconUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Choose Icon PNG
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleIconUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Color & Glow Customization */}
              <div className="grid grid-cols-2 gap-3">
                <ColorPicker label="Color Override" value={customBadge.color} onChange={(v) => setCustomBadge({ ...customBadge, color: v })} />
                <ColorPicker label="Glow Override" value={customBadge.glow} onChange={(v) => setCustomBadge({ ...customBadge, glow: v })} />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl glass text-xs font-semibold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition"
                >
                  Create & Equip Badge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
