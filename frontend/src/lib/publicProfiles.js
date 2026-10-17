import { api } from "@/lib/api";

const toCard = (u, i) => ({
  id: u.id,
  rank: u.rank || i + 1,
  username: u.username,
  display_name: u.display_name || u.username,
  avatar: u.avatar || u.avatar_url || "",
  banner: u.banner || "",
  bio: u.bio || "",
  tier: u.tier,
  views: u.views || 0,
  verified: (u.badges || []).includes("verified"),
  badges: (u.badges || []).slice(0, 4),
});

export async function loadLeaderboardRows(limit = 100) {
  const { data } = await api.get("/leaderboard", { params: { limit: Math.min(limit, 100) } });
  return (Array.isArray(data) ? data : []).filter((u) => u?.username).map(toCard);
}

export function filterProfiles(rows, { q = "", tier = "", badge = "" } = {}) {
  const term = String(q || "").trim().toLowerCase();
  return rows.filter((u) => {
    if (term && !`${u.username} ${u.display_name}`.toLowerCase().includes(term)) return false;
    if (tier && u.tier !== tier) return false;
    if (badge && !(u.badges || []).includes(badge)) return false;
    return true;
  });
}
