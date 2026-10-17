import { useEffect, useState } from "react";
import { CornerDownRight, ExternalLink, Hammer, Loader2, Pin } from "lucide-react";
import { Modal } from "@/components/ui-shared/Modal";
import { api } from "@/lib/api";
import { renderDevlogBody } from "@/lib/devlogBody";

/* The build log, as a popup inside the dashboard.
 *
 * The sidebar's Devlog entry used to hand the visitor to /!/devlogs, which is
 * the *public* changelog — a marketing feed written for people who have not
 * signed up, complete with its own nav and footer. Someone in the dashboard
 * wants the build notes, in place, without leaving the tab they were working in.
 *
 * So this reads the dashboard channel (the feed admin posts to for signed-in
 * members) and renders it in a dialog. The public changelog is still one link
 * away for anyone who wants it, and /!/dashboard/devlogs still works for
 * bookmarks.
 */
export function DevlogFeedModal({ open = false, onClose, channel = "dashboard" }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    api.get("/devlogs", { params: { channel, limit: 50 } })
      .then(({ data }) => {
        if (alive) setPosts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setPosts([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, channel]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      testid="devlog-feed-modal"
      icon={Hammer}
      title="Build log"
      description="What has changed here, in order. Written for signed-in members — the public changelog is its own feed."
      footer={
        <>
          <a
            href="/!/devlogs"
            target="_blank"
            rel="noreferrer"
            data-testid="devlog-feed-public"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Public changelog
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Done
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the build log…
        </div>
      ) : posts.length === 0 ? (
        <div data-testid="devlog-feed-empty" className="flex flex-col items-center gap-2 py-14 text-center">
          <Hammer className="h-6 w-6 text-zinc-600" />
          <span className="text-sm text-zinc-400">Nothing logged yet.</span>
          <span className="text-xs text-zinc-500">Build notes land here the moment they are published.</span>
        </div>
      ) : (
        <ol className="max-h-[62vh] space-y-3 overflow-y-auto pr-1" data-testid="devlog-feed-posts">
          {posts.map((post, i) => (
            <li key={post.id} data-testid="devlog-feed-post" className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
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
                <time dateTime={post.created_at} className="ml-auto font-mono2 text-[10px] uppercase tracking-wider text-zinc-500">
                  {new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </time>
              </div>

              <h3 className="mt-3 font-display text-base font-bold tracking-tight text-zinc-50">{post.title}</h3>
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
    </Modal>
  );
}

export default DevlogFeedModal;
