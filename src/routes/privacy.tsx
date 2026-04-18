import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/layout/Navbar";
import { useSettings } from "@/lib/store/settings";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy — ARC" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { lang } = useSettings();

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-[5vw]">
          <h1 className="font-display text-4xl font-extrabold mb-8">Privacy Policy</h1>
          <p className="text-arc-muted text-sm mb-4">Last updated: April 18, 2026</p>

          <div className="space-y-8 text-arc-text/80 text-sm leading-relaxed">
            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">1. Information We Collect</h2>
              <p>When you create an account, we collect your email address and display name. We also collect usage data including watch history, favorites, and profile preferences to provide a personalized experience. All data is stored securely in our Supabase-hosted database with row-level security policies.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">2. How We Use Your Data</h2>
              <p>Your data is used to: (a) provide the ARC streaming experience, (b) sync your watch progress across devices, (c) personalize content recommendations based on your viewing history, (d) save your language and subtitle preferences per profile. We never sell your personal data to third parties.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">3. Third-Party Services</h2>
              <p>ARC integrates with the following services:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>TMDB (The Movie Database)</strong> — for movie and TV show metadata, images, and ratings.</li>
                <li><strong>Real-Debrid</strong> — for stream resolution. Your Real-Debrid API token is stored securely server-side and never exposed to the browser.</li>
                <li><strong>Supabase</strong> — for authentication, database, and real-time sync.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">4. Data Security</h2>
              <p>All data is transmitted over HTTPS. Authentication is managed by Supabase Auth with industry-standard JWT tokens. Database access is enforced through Row-Level Security (RLS) policies — each user can only access their own profiles, watch history, and favorites.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">5. Kids Profiles</h2>
              <p>Kids profiles automatically filter content to show only family-friendly and animated titles rated PG or below. Kids profiles cannot access or modify account-level settings. Watch history for kids profiles is tracked separately.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">6. Data Retention & Deletion</h2>
              <p>You can delete any profile at any time, which permanently removes all associated watch history, favorites, and settings. To delete your entire account, contact support. Data is removed within 30 days of a deletion request.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">7. Contact</h2>
              <p>For privacy-related questions, contact us at <span className="text-arc-accent">privacy@arc-stream.io</span></p>
            </section>
          </div>

          <div className="mt-12 border-t border-white/10 pt-6">
            <Link to="/browse" className="text-sm text-arc-accent hover:text-white transition">← Back to Browse</Link>
          </div>
        </div>
      </main>
    </>
  );
}
