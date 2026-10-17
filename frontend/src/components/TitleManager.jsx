import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PATH_TITLES = {
  "/": "Home",
  "/!/home": "Home",
  "/!/legal": "Legal",
  "/legal": "Legal",
  "/!/pricing": "Pricing",
  "/pricing": "Pricing",
  "/!/login": "Login",
  "/login": "Login",
  "/!/auth/discord": "Discord Sign In",
  "/auth/discord": "Discord Sign In",
  "/!/dashboard": "Dashboard",
  "/!/dashboard/editor": "Editor",
  "/!/dashboard/links": "Links",
  "/!/dashboard/badges": "Badges",
  "/!/dashboard/widgets": "Widgets",
  "/!/dashboard/settings": "Settings",
  "/!/dashboard/templates": "Templates",
  "/!/dashboard/leaderboard": "Leaderboard",
  "/!/dashboard/stats": "Stats",
  // Admin pages now live under /!/dashboard/admin — the titles follow the URLs so
  // a browser tab still says which admin page is open.
  "/!/dashboard/admin": "Admin",
  "/!/dashboard/admin/bot": "Bot Manager",
  "/!/dashboard/admin/users": "User Manager",
  "/!/dashboard/admin/invites": "Invite Codes",
  "/!/dashboard/admin/notify": "Notify",
  "/!/dashboard/admin/devlogs": "Devlogs",
  "/!/dashboard/admin/site": "Site Settings",
  "/!/dashboard/admin/analytics": "Analytics",
};

export function TitleManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (PATH_TITLES[path]) {
      document.title = `swats | ${PATH_TITLES[path]}`;
    } else if (!path.startsWith("/!") && path.length > 1) {
      // Dynamic profile page handled in PublicProfile
    } else {
      document.title = "swats | Home";
    }
  }, [location]);

  return null;
}
