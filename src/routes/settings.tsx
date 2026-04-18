import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { ArcToggle } from "@/components/ui/ArcToggle";
import { Segmented } from "@/components/ui/Segmented";
import { useCursorHover } from "@/lib/cursor-context";
import { avatarGradient } from "@/lib/gradients";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ARC" },
      { name: "description", content: "Manage your ARC account, playback, and appearance." },
      { property: "og:title", content: "Settings — ARC" },
      { property: "og:description", content: "Manage your ARC account, playback, and appearance." },
    ],
  }),
  component: SettingsPage,
});

const SECTIONS = [
  "Account",
  "Profiles",
  "Playback",
  "Appearance",
  "Notifications",
  "Subscription",
  "Help",
] as const;
type Section = (typeof SECTIONS)[number];

function SettingsPage() {
  const [section, setSection] = useState<Section>("Account");
  const [autoplay, setAutoplay] = useState(true);
  const [skipIntro, setSkipIntro] = useState(true);
  const [downloadHQ, setDownloadHQ] = useState(false);
  const [push, setPush] = useState(true);
  const [emails, setEmails] = useState(false);
  const [quality, setQuality] = useState<"Auto" | "1080p" | "4K">("4K");
  const [theme, setTheme] = useState<"Dark" | "Dim" | "Light">("Dark");
  const cursor = useCursorHover("link");

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-28 pb-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-[5vw] md:grid-cols-[240px_1fr]">
          {/* Sidebar */}
          <aside className="md:sticky md:top-28 md:self-start">
            <h1 className="font-display text-3xl font-extrabold">Settings</h1>
            <nav className="mt-6 flex flex-row gap-1 overflow-x-auto md:flex-col">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  {...cursor}
                  onClick={() => setSection(s)}
                  className={cn(
                    "group relative flex items-center justify-start whitespace-nowrap rounded-md px-3 py-2 text-sm transition-all focus-visible:outline-none",
                    section === s
                      ? "bg-white/[0.04] text-arc-text"
                      : "text-arc-muted hover:translate-x-1 hover:text-arc-text",
                  )}
                >
                  {section === s && (
                    <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-[3px] rounded-r bg-arc-accent" />
                  )}
                  {s}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <section className="min-h-[60vh] arc-scrollbar">
            {section === "Account" && (
              <Block title="Account" desc="Your basic ARC profile and subscription.">
                <div className="flex items-center gap-5">
                  <div
                    className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-full border border-white/15"
                    style={{ background: avatarGradient("Alex") }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/60 group-hover:opacity-100">
                      Edit
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold">Alex Morgan</div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-arc-muted">
                      alex@arc.tv
                      <span className="rounded-full bg-arc-accent/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-arc-accent">
                        VERIFIED
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="mt-8 rounded-2xl p-px"
                  style={{ background: "linear-gradient(135deg, var(--arc-accent), var(--arc-accent-2))" }}
                >
                  <div className="rounded-2xl bg-arc-surface p-6">
                    <div className="label-caps text-arc-accent">Current Plan</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <div className="font-display text-2xl font-extrabold">ARC Premiere</div>
                        <div className="mt-1 text-sm text-arc-muted">Renews on March 14, 2025</div>
                      </div>
                      <button {...cursor} className="text-sm text-arc-accent hover:underline">
                        Manage →
                      </button>
                    </div>
                  </div>
                </div>
              </Block>
            )}

            {section === "Playback" && (
              <Block title="Playback" desc="Tune how stories play.">
                <Row label="Autoplay next episode">
                  <ArcToggle checked={autoplay} onChange={setAutoplay} />
                </Row>
                <Row label="Auto-skip intros">
                  <ArcToggle checked={skipIntro} onChange={setSkipIntro} />
                </Row>
                <Row label="High quality downloads">
                  <ArcToggle checked={downloadHQ} onChange={setDownloadHQ} />
                </Row>
                <Row label="Streaming quality">
                  <Segmented options={["Auto", "1080p", "4K"] as const} value={quality} onChange={setQuality} />
                </Row>
                <Row label="Audio language">
                  <select
                    {...cursor}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-arc-text focus:outline-none"
                    defaultValue="English"
                  >
                    {["English", "Français", "日本語", "Español", "Deutsch"].map((l) => (
                      <option key={l} value={l} className="bg-arc-surface">{l}</option>
                    ))}
                  </select>
                </Row>
              </Block>
            )}

            {section === "Appearance" && (
              <Block title="Appearance" desc="ARC adapts to the room.">
                <div className="grid gap-4 sm:grid-cols-3">
                  {(["Dark", "Dim", "Light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      {...cursor}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border p-4 text-left transition-all",
                        theme === t ? "border-arc-accent bg-arc-accent/5" : "border-white/10 hover:border-white/30",
                      )}
                    >
                      <div
                        className="mb-4 aspect-video w-full rounded-lg"
                        style={{
                          background:
                            t === "Dark"
                              ? "linear-gradient(135deg, #080808, #1a1a1a)"
                              : t === "Dim"
                                ? "linear-gradient(135deg, #1a1a2e, #2d2d44)"
                                : "linear-gradient(135deg, #f5f5f5, #e2e2e2)",
                        }}
                      />
                      <div className="text-sm font-medium">{t}</div>
                      <div className="mt-1 text-xs text-arc-muted">
                        {t === "Dark" ? "Cinematic & deep" : t === "Dim" ? "Soft contrast" : "Daylight"}
                      </div>
                      {theme === t && (
                        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-arc-accent text-[10px] text-arc-void">
                          ✓
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </Block>
            )}

            {section === "Notifications" && (
              <Block title="Notifications" desc="Stay in the loop — or don't.">
                <Row label="Push notifications">
                  <ArcToggle checked={push} onChange={setPush} />
                </Row>
                <Row label="Newsletter & releases">
                  <ArcToggle checked={emails} onChange={setEmails} />
                </Row>
              </Block>
            )}

            {section === "Profiles" && (
              <Block title="Profiles" desc="Up to 5 unique watchers.">
                <div className="text-sm text-arc-muted">Manage who's on this account from the “Who's watching?” screen.</div>
              </Block>
            )}

            {section === "Subscription" && (
              <Block title="Subscription" desc="Plan, billing & invoices.">
                <Row label="Plan"><span className="text-sm">ARC Premiere · $19/mo</span></Row>
                <Row label="Next charge"><span className="text-sm">March 14, 2025</span></Row>
                <Row label="Payment method"><span className="text-sm">•••• 4421</span></Row>
              </Block>
            )}

            {section === "Help" && (
              <Block title="Help" desc="We're here.">
                <div className="text-sm text-arc-muted">
                  Visit the help center, contact support, or read the playback troubleshooting guide.
                </div>
              </Block>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function Block({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        {desc && <p className="mt-1 text-sm text-arc-muted">{desc}</p>}
      </div>
      <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0">
      <div className="text-sm text-arc-text/85">{label}</div>
      <div>{children}</div>
    </div>
  );
}
