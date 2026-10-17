import { useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CONTACT_EMAIL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Scale, Shield, RotateCcw, FileText, Mail, AlertTriangle, Cookie } from "lucide-react";

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const SECTIONS = [
  {
    icon: Scale,
    title: "Terms of Service",
    items: [
      ["1. Acceptance of Terms", "By accessing or using swats.bio (the \"Service\") you agree to be bound by these Terms of Service and all policies referenced here. If you do not agree, you may not use the Service. We may revise these terms at any time; material changes will be surfaced on this page and continued use after changes take effect constitutes acceptance."],
      ["2. Accounts & Eligibility", "You must be at least 13 years old (or the minimum digital-consent age in your jurisdiction) to create an account. You are responsible for all activity under your account and for keeping your password and any recovery codes secure. One person may hold multiple paired accounts, but automated mass-registration is prohibited."],
      ["3. Acceptable Use", "You agree not to upload, link to, or distribute content that is unlawful, infringing, malicious, sexually exploitative of minors, or that harasses or endangers others. You may not attempt to probe, scan, overload, or circumvent the security of the Service, scrape at scale, or resell access without written permission."],
      ["4. User Content & Licence", "You retain ownership of the content you upload (avatars, banners, bios, links, crosshair images, widgets). You grant swats.bio a non-exclusive, worldwide, royalty-free licence to host, display, and serve that content solely to operate and promote the Service. You are solely responsible for content you publish on your page."],
      ["5. Premium & Billing", "Premium subscriptions are billed through our payment processor (Stripe). Features unlock immediately upon successful payment. Prices may change with notice; changes do not affect the current paid period. You are responsible for applicable taxes. See the Refund Policy below."],
      ["6. Service Availability", "The Service is provided on an \"as is\" and \"as available\" basis. We do not guarantee uninterrupted availability and may modify, suspend, or discontinue features at any time. Scheduled maintenance and third-party outages may temporarily affect widgets and effects."],
      ["7. Termination", "We may suspend or terminate accounts that violate these terms, with or without notice. You may delete your account at any time. Upon termination your public page and associated content may be removed, and no refund is owed for a terminated account that breached these terms."],
      ["8. Limitation of Liability", "To the maximum extent permitted by law, swats.bio and its operators are not liable for indirect, incidental, or consequential damages, or for loss of data, profits, or goodwill arising from your use of the Service. Our total liability is limited to the amount you paid in the twelve months preceding the claim."],
      ["9. Governing Law", "These terms are governed by the laws applicable to the operator's principal place of business, without regard to conflict-of-law rules. Disputes will be resolved in the competent courts of that jurisdiction."],
    ],
  },
  {
    icon: Shield,
    title: "Privacy Policy",
    items: [
      ["1. Information We Collect", "Account data (email, hashed password, optional linked Discord ID), content you upload, and technical/usage data such as validated page views, approximate device/browser type, and security events. Payment details are handled by Stripe and are never stored on our servers."],
      ["2. How We Use Data", "To operate your profile, power widgets, assign badges and rewards, process payments, prevent abuse and fraud, and improve the Service. Aggregated, non-identifying metrics (such as total public view counts) may be displayed publicly on profiles and leaderboards."],
      ["3. Legal Bases", "Where applicable (e.g. GDPR), we process data under contract (to provide the Service you request), legitimate interests (security, analytics, abuse prevention), consent (optional integrations), and legal obligation (tax and compliance records)."],
      ["4. Third-Party Processors", "We integrate with Discord, Spotify, Stripe, Cloudinary and similar providers. We share only the minimum data needed and their processing is governed by their own policies. We do not sell your personal data to advertisers."],
      ["5. Cookies & Local Storage", "We use strictly necessary cookies/tokens for authentication and a small amount of local storage for device preferences (such as corner-radius and sidebar state). We do not run third-party advertising trackers."],
      ["6. Data Retention & Your Rights", `You may request access, export, correction, or deletion of your data at any time by emailing ${CONTACT_EMAIL}. We retain data only as long as needed to provide the Service or meet legal obligations, then delete or anonymise it.`],
      ["7. Security", "Passwords are hashed, sensitive actions are rate-limited and audit-logged, and optional two-factor authentication is available. No system is perfectly secure; you use the Service at your own risk and should enable 2FA for sensitive accounts."],
      ["8. Children's Privacy", "The Service is not directed to children under 13. If we learn we have collected data from a child under 13 without appropriate consent, we will delete it promptly."],
    ],
  },
  {
    icon: RotateCcw,
    title: "Refund Policy",
    items: [
      ["1. Digital Goods", "Premium is a digital subscription delivered instantly. Because access is granted immediately, purchases are generally non-refundable once the subscription is active."],
      ["2. Exceptions", `Refunds may be granted at our discretion within 7 days of purchase if the Service was materially unavailable for an extended period or a verifiable billing error occurred. Email ${CONTACT_EMAIL} with your transaction ID and details.`],
      ["3. Cancellations", "You may cancel a recurring subscription at any time; cancellation stops future renewals and you keep Premium until the end of the current paid period. We do not pro-rate partial periods."],
      ["4. Chargebacks", `Initiating a chargeback without first contacting ${CONTACT_EMAIL} may be treated as a breach of these terms and can result in immediate account termination and loss of all premium features and badges.`],
    ],
  },
  {
    icon: FileText,
    title: "DMCA & Content",
    items: [
      ["1. Copyright Claims", `If you believe content on swats.bio infringes your copyright, send a takedown notice to ${CONTACT_EMAIL} identifying the copyrighted work, the exact infringing URL, your contact details, and a good-faith statement that you are authorised to act.`],
      ["2. Counter-Notices", "If your content was removed and you believe this was a mistake or misidentification, you may submit a counter-notice with the same identifying details. We will review and may restore the content where appropriate."],
      ["3. Repeat Infringers", "Accounts subject to repeated, substantiated infringement notices will be terminated in accordance with applicable law."],
    ],
  },
  {
    icon: Cookie,
    title: "Cookie Notice",
    items: [
      ["1. What We Use", "Authentication tokens (to keep you signed in), a CSRF/security token, and limited local storage for device-only preferences. These are essential to operate the Service."],
      ["2. Managing Cookies", "You can clear cookies and local storage in your browser at any time; doing so will sign you out and reset device preferences. We do not use cross-site advertising cookies."],
    ],
  },
  {
    icon: AlertTriangle,
    title: "Disclaimer",
    items: [
      ["1. No Warranty", "The Service, including all effects, overlays, widgets, and third-party data, is provided \"as is\" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement."],
      ["2. Third-Party Data", "Widget data (Discord, Spotify, GitHub, Roblox, Valorant, Steam and others) originates from third-party APIs and may be delayed, incomplete, or temporarily unavailable. We are not responsible for the accuracy of third-party content."],
      ["3. User Pages", "Profiles are created by their owners. swats.bio does not endorse and is not responsible for the content, links, or claims on any user page. Visit external links at your own discretion."],
    ],
  },
];

export default function Legal() {
  const [active, setActive] = useState(slug(SECTIONS[0].title));
  const updated = "June 2026";

  const go = (id) => {
    setActive(id);
    document.getElementById(`legal-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen sw-page-bg text-zinc-100 grain" data-testid="legal-page">
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 pt-32 pb-20">
        <div className="mb-10 border-b border-white/10 pb-8">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-mono2 text-brand-300"><Scale className="h-3.5 w-3.5" /> Legal Center</div>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-black text-zinc-50">Legal</h1>
          <p className="mt-3 text-sm text-zinc-500 max-w-2xl">The terms, policies and notices that govern your use of swats.bio. Last updated {updated}.</p>
        </div>

        <div className="grid lg:grid-cols-[230px_1fr] gap-10">
          <aside className="lg:sticky lg:top-28 self-start">
            <nav data-testid="legal-nav" className="glass rounded-2xl p-2 border border-white/10">
              {SECTIONS.map((s) => {
                const id = slug(s.title);
                return (
                  <button key={id} data-testid={`legal-nav-${id}`} onClick={() => go(id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active === id ? "bg-brand-500/15 text-brand-200" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"}`}>
                    <s.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="space-y-14 min-w-0">
            {SECTIONS.map((sec) => {
              const id = slug(sec.title);
              return (
                <section key={id} id={`legal-${id}`} data-testid={`legal-section-${id}`} className="scroll-mt-28">
                  <div className="flex items-center gap-3 mb-6 pb-3 border-b border-white/10">
                    <span className="w-10 h-10 rounded-xl glass flex items-center justify-center text-brand-400"><sec.icon className="w-5 h-5" /></span>
                    <h2 className="font-display text-2xl font-extrabold text-zinc-100">{sec.title}</h2>
                  </div>
                  <div className="space-y-6">
                    {sec.items.map(([h, b], i) => (
                      <div key={i} data-testid={`legal-clause-${id}-${i}`}>
                        <h3 className="text-sm font-bold text-zinc-100 mb-1.5">{h}</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">{b}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            <div data-testid="legal-contact" className="glass rounded-2xl p-8 text-center">
              <span className="inline-flex w-12 h-12 rounded-xl glass items-center justify-center text-brand-400 mb-4"><Mail className="w-5 h-5" /></span>
              <h2 className="font-display text-xl font-extrabold text-zinc-100">Contact & Legal Inquiries</h2>
              <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">For privacy requests, DMCA notices, billing disputes or any other legal matter, reach our team directly.</p>
              <a href={`mailto:${CONTACT_EMAIL}`} data-testid="legal-contact-email" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold hover:brightness-110 transition">
                <Mail className="w-4 h-4" /> {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
