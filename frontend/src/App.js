import { useEffect, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/lib/notify";
import ContextMenuProvider from "@/components/ContextMenu";

import Landing from "@/pages/Landing";
import Legal from "@/pages/Legal";
import Pricing from "@/pages/Pricing";
import Donations from "@/pages/Donations";
import Login from "@/pages/Login";
import DiscordCallback from "@/pages/DiscordCallback";
import PublicProfile from "@/pages/PublicProfile";
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
// The public changelog. Kept eager-worthy but split anyway: visitors land on it
// from a bell notification, not as a first impression.
const DevlogFeed = lazy(() => import("@/pages/Devlogs"));
const Explore = lazy(() => import("@/pages/Explore"));
const Docs = lazy(() => import("@/pages/Docs"));
const Ranked = lazy(() => import("@/pages/Ranked"));

// Route-level code splitting. The dashboard (and its two variants) is the bulk
// of the bundle and is never needed before login, so each page is fetched on
// demand instead of shipping in the first chunk. The two layout shells stay
// eager so the sidebar paints immediately.
const Overview = lazy(() => import("@/pages/dashboard/Overview"));
const Editor = lazy(() => import("@/pages/dashboard/Editor"));
const Badges = lazy(() => import("@/pages/dashboard/Badges"));
const Leaderboard = lazy(() => import("@/pages/dashboard/Leaderboard"));
const Links = lazy(() => import("@/pages/dashboard/Links"));
const Widgets = lazy(() => import("@/pages/dashboard/Widgets"));
const Templates = lazy(() => import("@/pages/dashboard/Templates"));
const Settings = lazy(() => import("@/pages/dashboard/Settings"));
const Stats = lazy(() => import("@/pages/dashboard/Stats"));
const Rewards = lazy(() => import("@/pages/dashboard/Rewards"));
const UserManager = lazy(() => import("@/pages/dashboard/UserManager"));
const InviteCodes = lazy(() => import("@/pages/dashboard/InviteCodes"));
const SiteSettings = lazy(() => import("@/pages/dashboard/SiteSettings"));
const Analytics = lazy(() => import("@/pages/dashboard/Analytics"));
const AuditLog = lazy(() => import("@/pages/dashboard/AuditLog"));
const Notices = lazy(() => import("@/pages/dashboard/Notices"));
// The encrypted inbox: friends, requests, conversations and groups.
const AdminDevlogs = lazy(() => import("@/pages/dashboard/Devlogs"));
const DashboardDevlog = lazy(() => import("@/pages/dashboard/Devlog"));
const AdminHub = lazy(() => import("@/pages/dashboard/Admin"));

import { api, API } from "@/lib/api";
import { TitleManager } from "@/components/TitleManager";

function BackendHealthCheck() {
  useEffect(() => {
    api.get("/health")
      .then(({ data }) => {
        console.log(
          `%c[swats.bio]%c ✅ Backend connected successfully to %c${API}%c (Status: ${data?.status || "ok"})`,
          "color: #A48DF4; font-weight: bold;",
          "color: #22c55e; font-weight: bold;",
          "color: #38bdf8; font-weight: bold;",
          "color: #a1a1aa;"
        );
      })
      .catch((err) => {
        const detail = err.response?.data?.detail || err.message;
        console.warn(
          `%c[swats.bio]%c ⚠️ Backend health check failed for %c${API}%c!\nError: ${detail}\n👉 If deployed on Vercel/Railway, verify backend server is live and REACT_APP_BACKEND_URL is set in environment variables.`,
          "color: #A48DF4; font-weight: bold;",
          "color: #f59e0b; font-weight: bold;",
          "color: #38bdf8; font-weight: bold;",
          "color: #a1a1aa;"
        );
      });
  }, []);
  return null;
}

/* While the session check is in flight we render nothing at all — no fake
   progress bar. The page behind it is already painted; a spinner here would
   only be a second flash before the (real) render. */
const Protected = ({ children }) => {
  const { user } = useAuth();
  if (user === null) return null;
  if (user === false) return <Navigate to="/!/login" replace />;
  return children;
};

/* The admin area used to be seven routes that each rendered straight into the
   dashboard, so a non-admin who typed the URL saw an admin page render and then
   fail on every request. They are gated here — the API stays the real authority
   (every admin route requires the admin role), this just keeps the shell honest. */
const RequireAdmin = ({ children }) => {
  const { user } = useAuth();
  if (user === null) return null; // same rule as Protected above
  if (user === false) return <Navigate to="/!/login" replace />;
  if (user.role !== "admin" && !user.is_owner) return <Navigate to="/!/dashboard" replace />;
  return children;
};

/* Shown while an on-demand page chunk loads. Deliberately quiet — it appears
   for a few hundred milliseconds at most on a warm connection. */
const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
    Loading…
  </div>
);

function App() {
  return (
    <div className="App">
      {/* Mounted once, globally. Renders its own bottom-right stack. */}
      <Toaster />
      {/* The swats right-click menu: one provider for the whole document, so
          every surface (and the blank background under them) opens the same
          styled menu instead of the browser's grey slab. */}
      <ContextMenuProvider />
      <AuthProvider>
        <BrowserRouter>
          <BackendHealthCheck />
          <TitleManager />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Landing & Root */}
              <Route path="/" element={<Landing />} />

              {/* System Routes under /!/... allowing clean aliases on root */}
              <Route path="/!/home" element={<Landing />} />
              <Route path="/!/legal" element={<Legal />} />
              <Route path="/!/pricing" element={<Pricing />} />
              <Route path="/!/donate" element={<Donations />} />
              <Route path="/donate" element={<Navigate to="/!/donate" replace />} />
              <Route path="/!/login" element={<Login />} />
              {/* The Compare tab is gone. Old links and bookmarks must not fall
                  through to the /:alias profile route and land on a "not
                  claimed" page for a username nobody can register. */}
              <Route path="/!/compare" element={<Navigate to="/!/home" replace />} />
              <Route path="/compare" element={<Navigate to="/" replace />} />
              <Route path="/!/auth/discord" element={<DiscordCallback />} />
              {/* Public devlog / changelog. */}
              <Route path="/!/explore" element={<Explore />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/!/docs" element={<Docs />} />
              <Route path="/!/docs/:section" element={<Docs />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:section" element={<Docs />} />
              <Route path="/!/ranked" element={<Ranked />} />
              <Route path="/ranked" element={<Ranked />} />
              <Route path="/!/devlogs" element={<DevlogFeed />} />
              <Route path="/devlogs" element={<DevlogFeed />} />

              {/* Legacy route fallbacks */}
              <Route path="/legal" element={<Legal />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/discord" element={<DiscordCallback />} />

              {/* Dashboard routes */}
              <Route path="/!/dashboard" element={<Protected><DashboardLayout /></Protected>}>
                <Route index element={<Overview />} />
                <Route path="editor" element={<Editor />} />
                <Route path="links" element={<Links />} />
                <Route path="badges" element={<Badges />} />
                <Route path="widgets" element={<Widgets />} />
                <Route path="settings" element={<Settings />} />
                <Route path="templates" element={<Templates />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                {/* The build log — the dashboard's own devlog feed, separate
                    from the public changelog at /!/devlogs. */}
                <Route path="devlogs" element={<DashboardDevlog />} />
                <Route path="stats" element={<Stats />} />
                <Route path="rewards" element={<Rewards />} />
                {/* Admin: one entry point, its pages as the section's own tabs. */}
                <Route path="admin" element={<RequireAdmin><AdminHub /></RequireAdmin>} />
                {/* The Bot tab is the Users tab now: the roster endpoint carries the
                    Discord half of every account, so one page owns both jobs. The
                    old URL resolves to it instead of falling dead. */}
                <Route path="admin/bot" element={<Navigate to="/!/dashboard/admin/users" replace />} />
                <Route path="admin/users" element={<RequireAdmin><UserManager /></RequireAdmin>} />
                <Route path="admin/invites" element={<RequireAdmin><InviteCodes /></RequireAdmin>} />
                <Route path="admin/notify" element={<RequireAdmin><Notices /></RequireAdmin>} />
                <Route path="admin/devlogs" element={<RequireAdmin><AdminDevlogs /></RequireAdmin>} />
                <Route path="admin/site" element={<RequireAdmin><SiteSettings /></RequireAdmin>} />
                <Route path="admin/analytics" element={<RequireAdmin><Analytics /></RequireAdmin>} />
                <Route path="admin/audit" element={<RequireAdmin><AuditLog /></RequireAdmin>} />

                {/* The old flat admin URLs, kept resolving for bookmarks and links. */}
                <Route path="bot" element={<Navigate to="/!/dashboard/admin/users" replace />} />
                <Route path="users" element={<Navigate to="/!/dashboard/admin/users" replace />} />
                <Route path="invites" element={<Navigate to="/!/dashboard/admin/invites" replace />} />
                <Route path="notify" element={<Navigate to="/!/dashboard/admin/notify" replace />} />
                {/* devlogs used to redirect to admin/devlogs. It is the build log
                    now, so that redirect is gone — bookmarks to it land on the
                    feed instead of the authoring form. */}
                <Route path="site" element={<Navigate to="/!/dashboard/admin/site" replace />} />
                <Route path="analytics" element={<Navigate to="/!/dashboard/admin/analytics" replace />} />
              </Route>

              <Route path="/dashboard" element={<Navigate to="/!/dashboard" replace />} />
              <Route path="/dashboard/*" element={<Navigate to="/!/dashboard" replace />} />

              {/* The blue-and-white u.pet dashboard that used to live at
                  /!/dashboard-new is gone. Its URLs redirect instead of falling
                  through to the alias route, which would have shown a blank page
                  (and, worse, looked up a user called "dashboard-new"). */}
              <Route path="/!/dashboard-new" element={<Navigate to="/!/dashboard" replace />} />
              <Route path="/!/dashboard-new/*" element={<Navigate to="/!/dashboard" replace />} />

              {/* Dynamic User Profile Alias (swats.bio/:alias) */}
              <Route path="/:alias" element={<PublicProfile />} />
            </Routes>
            </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
