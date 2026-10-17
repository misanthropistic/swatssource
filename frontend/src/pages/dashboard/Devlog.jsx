import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Hammer, Loader2, Pin, ExternalLink, CornerDownRight } from "lucide-react";
import { api } from "@/lib/api";
import { renderDevlogBody } from "@/lib/devlogBody";
import { EmptyState } from "@/components/ui-shared/PageUI";

/* The dashboard devlog.
 *
 * Two feeds, deliberately separate. The public changelog at /!/devlogs is what
 * visitors read — features, launches, the polished version. This one is the
 * build log: what is being worked on, what broke, what got torn out. Writing for
 * both audiences in one list meant the build notes were either too raw for the
 * marketing page or too glib to be useful to the people actually building.
 *
 * The channel is chosen when a post is published (/!/dashboard/admin/devlogs)
 * and served by /api/devlogs?channel=dashboard.
 */
export default function Devlog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/devlogs", { params: { channel: "dashboard", limit: 50 } })
      .then(({ data }) => { if (alive) setPosts(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div data-testid="dashboard-devlog-page" className="space-y-6">
      <div className="glass rounded-3xl p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2.5 font-display text-xl font-bold text-zinc-100">
              <Hammer className="h-5 w-5 text-brand-400" /> Build log
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-400">
              What is being worked on here, in order. This is the dashboard feed — the public changelog at
              <span className="mx-1 text-zinc-300">/devlogs</span> is written separately for visitors.
            </p>
          </div>
          <Link
            to="/!/devlogs"
            data-testid="devlog-public-link"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Read the public devlog
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the build log…
        </div>
      ) : posts.length === 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <EmptyState
            icon={Hammer}
            title="Nothing logged yet"
            hint="Build notes published to the dashboard channel land here."
          />
        </div>
      ) : (
        <ol className="relative space-y-4">
          {posts.map((post, i) => (
            <li
              key={post.id}
              data-testid="dashboard-devlog-post"
              className="glass relative rounded-2xl p-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 font-mono2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  <CornerDownRight className="h-3 w-3" /> #{posts.length - i}
                </span>
                {post.tag && (
                  <span className="rounded-full bg-brand-500/12 px-2.5 py-0.5 font-mono2 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                    {post.tag}
                  </span>
                )}
                {post.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2.5 py-0.5 font-mono2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                    <Pin className="h-3 w-3" /> Pinned
                  </span>
                )}
                <time
                  dateTime={post.created_at}
                  className="ml-auto font-mono2 text-[10px] uppercase tracking-wider text-zinc-500"
                >
                  {new Date(post.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </div>

              <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-zinc-50">{post.title}</h3>

              {renderDevlogBody(post.body)}

              {post.author_username && (
                <div className="mt-4 border-t border-white/5 pt-3 font-mono2 text-[10px] uppercase tracking-wider text-zinc-600">
                  written by @{post.author_username}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
