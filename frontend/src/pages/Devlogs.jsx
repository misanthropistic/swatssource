import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Newspaper, Pin } from "lucide-react";
import { Logo } from "@/components/landing/Navbar";
import { api } from "@/lib/api";
import { renderDevlogBody } from "@/lib/devlogBody";

/* The public changelog.
 *
 * Bodies are still plain text — never HTML from an admin text box into a public
 * page. What changed is that the handful of constructs the devlog is actually
 * written with are formatted instead of printed literally: "# swats.bio devlog:"
 * used to show up with the hash, and a quoted line with its own ">". See
 * lib/devlogBody.jsx for the supported syntax.
 */

export default function Devlogs() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get("/devlogs")
      .then(({ data }) => { if (alive) setPosts(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="devlogs-page">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[600px] -translate-x-1/2 rounded-full bg-brand-600/8 blur-[150px]" />

      <div className="relative mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/!/home" className="flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Logo size="text-base" />
        </div>

        <header className="mb-8">
          <h1 className="flex items-center gap-3 font-display text-3xl font-black tracking-tight text-zinc-50">
            <Newspaper className="h-7 w-7 text-brand-400" /> Devlog
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Everything that ships on swats.bio, in the order it shipped. Notifications in the dashboard point back
            here.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading devlogs…
          </div>
        ) : posts.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-16 text-center">
            <Newspaper className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
            <p className="text-sm text-zinc-400">No devlogs published yet — the first one is on its way.</p>
          </div>
        ) : (
          <ol className="space-y-5">
            {posts.map((post) => (
              <li key={post.id} data-testid="devlog-post" className="glass rounded-2xl p-6">
                <div className="flex flex-wrap items-center gap-2">
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

                <h2 className="mt-3 font-display text-xl font-bold tracking-tight text-zinc-50">{post.title}</h2>

                {renderDevlogBody(post.body)}

                {post.author_username && (
                  <div className="mt-4 border-t border-white/5 pt-3 font-mono2 text-[10px] uppercase tracking-wider text-zinc-600">
                    posted by @{post.author_username}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
