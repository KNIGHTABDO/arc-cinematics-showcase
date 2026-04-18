import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/layout/Navbar";
import { useSettings } from "@/lib/store/settings";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Service — ARC" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { lang } = useSettings();

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-[5vw]">
          <h1 className="font-display text-4xl font-extrabold mb-8">Terms of Service</h1>
          <p className="text-arc-muted text-sm mb-4">Last updated: April 18, 2026</p>

          <div className="space-y-8 text-arc-text/80 text-sm leading-relaxed">
            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">1. Acceptance of Terms</h2>
              <p>By accessing or using ARC ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you must discontinue use immediately. ARC is a personal media management interface that connects to third-party services for content delivery.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">2. Account Registration</h2>
              <p>You must create an account to use the Service. You are responsible for maintaining the security of your credentials. Each account supports up to 5 individual profiles, each with independent preferences, watch history, and favorites.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">3. Content & Third-Party Services</h2>
              <p>ARC does not host or distribute any media content. All media metadata (titles, descriptions, images) is provided by TMDB under their API terms. Stream resolution is handled by your personal Real-Debrid account. You are solely responsible for ensuring your use of Real-Debrid complies with your local jurisdiction's laws.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">4. User Conduct</h2>
              <p>You agree not to: (a) share your account credentials, (b) reverse-engineer or disassemble the Service, (c) use the Service for illegal purposes, (d) attempt to bypass content restrictions on Kids profiles, (e) overload the Service infrastructure with automated requests.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">5. Kids Profiles</h2>
              <p>Kids profiles are designed to restrict access to age-appropriate content. However, ARC relies on third-party ratings (TMDB, MPAA) for content classification. Parents and guardians should exercise independent judgment and supervision.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">6. Intellectual Property</h2>
              <p>The ARC brand, UI design, code, and user experience are the property of ARC. All movie and TV show metadata, images, and ratings are the property of TMDB and their respective rights holders.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">7. Service Availability</h2>
              <p>ARC is provided "as is" without warranty. We do not guarantee uninterrupted access, specific stream quality, or availability of any particular content. Stream availability depends on your Real-Debrid subscription and cache status.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">8. Termination</h2>
              <p>We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time through the Settings page.</p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-arc-text">9. Contact</h2>
              <p>For questions regarding these terms, contact <span className="text-arc-accent">legal@arc-stream.io</span></p>
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
