import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSettings } from "@/lib/store/settings";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const DEFAULT_COLORS = [
  { name: "Arc Purple", value: "oklch(0.76 0.15 305)" },
  { name: "Neon Blue", value: "oklch(0.75 0.14 250)" },
  { name: "Emerald", value: "oklch(0.75 0.14 150)" },
  { name: "Crimson", value: "oklch(0.65 0.22 25)" },
  { name: "Golden", value: "oklch(0.85 0.15 80)" },
];

function SettingsPage() {
  const { profile, updateSettings } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;

  return (
    <div className="min-h-screen pt-24 pb-12 px-[5vw]">
      <Navbar />

      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">
            {t("settings.profileSettings", profile.ui_language)}
          </h1>
          <p className="text-arc-muted mt-2">
            {t("settings.managePrefs", profile.ui_language)}
            {profile.name}.
          </p>
        </div>

        {/* Global Settings */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">
            {t("settings.localization", profile.ui_language)}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80">
                {t("settings.uiLanguage", profile.ui_language)}
              </label>
              <select
                className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition"
                value={profile.ui_language}
                onChange={(e) =>
                  updateSettings({
                    ui_language: e.target.value,
                    tmdb_language:
                      e.target.value === "ar"
                        ? "ar-SA"
                        : e.target.value === "fr"
                          ? "fr-FR"
                          : "en-US",
                  })
                }
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="fr">Français (French)</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80">
                {t("settings.defaultSubs", profile.ui_language)}
              </label>
              <select
                className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition"
                value={profile.subtitle_language}
                onChange={(e) => updateSettings({ subtitle_language: e.target.value })}
              >
                <option value="ar">Arabic</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
              </select>
            </div>
          </div>
        </section>

        {/* Streaming Preferences */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">Streaming Backbone</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80">
                Default Video Quality
              </label>
              <select
                className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition"
                value={profile.video_quality}
                onChange={(e) => updateSettings({ video_quality: e.target.value })}
              >
                <option value="4k">4K HDR / 2160p (Best Quality)</option>
                <option value="1080p">1080p (Fastest Start)</option>
                <option value="720p">720p (Data Saver)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Real-Debrid CDN Optimization */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <div>
            <h2 className="font-display text-2xl font-bold">Real-Debrid CDN Optimization</h2>
            <p className="text-sm text-arc-muted mt-1">
              Real-Debrid routes your streams through a global CDN. Running the speedtest tells RD
              which server node is fastest for your location — significantly improving buffer times
              and max bitrate.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-arc-surface-2/60 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-arc-accent/10 flex items-center justify-center shrink-0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-arc-accent"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-arc-text">
                    Step 1 — Run the RD Speedtest
                  </p>
                  <p className="text-xs text-arc-muted mt-0.5">
                    Opens Real-Debrid's official speedtest page. Your browser will measure
                    throughput to each CDN node. RD automatically updates your routing preference
                    based on results.
                  </p>
                </div>
              </div>
              <a
                href="https://real-debrid.com/speedtest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-arc-accent text-arc-void font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-white transition"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open RD Speedtest
              </a>
            </div>

            <div className="bg-arc-surface-2/60 border border-white/10 rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-arc-muted"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-arc-text">
                    Step 2 — RD Auto-Optimizes CDN Routing
                  </p>
                  <p className="text-xs text-arc-muted mt-0.5">
                    After the test, Real-Debrid automatically routes your download traffic through
                    the fastest node (e.g.{" "}
                    <span className="font-mono text-arc-accent/80">lax1</span>,{" "}
                    <span className="font-mono text-arc-accent/80">lon1</span>,{" "}
                    <span className="font-mono text-arc-accent/80">sgp1</span>). No manual action
                    required — your next stream will use the optimal server.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-arc-muted px-1">
              💡 Tip: Re-run this test whenever your internet provider or physical location changes
              for best streaming performance.
            </p>
          </div>
        </section>

        {/* Account Management */}
        <section className="space-y-6 arc-card p-6 md:p-8 border border-red-500/20">
          <h2 className="font-display text-2xl font-bold text-red-400">
            {t("settings.accountManagement", profile.ui_language)}
          </h2>
          <p className="text-sm text-arc-text/70 mb-4">
            {t("settings.accountManagementDesc", profile.ui_language)}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80 leading-none">
                {t("settings.newPassword", profile.ui_language)}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="new_password"
                  placeholder={t("settings.enterNewPassword", profile.ui_language)}
                  className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition text-white placeholder-white/30"
                />
                <button
                  onClick={async () => {
                    const el = document.getElementById("new_password") as HTMLInputElement;
                    if (!el.value) return;
                    const { error } = await supabase.auth.updateUser({ password: el.value });
                    if (error)
                      alert(t("settings.errorUpdatePass", profile.ui_language) + error.message);
                    else {
                      alert(t("settings.passUpdated", profile.ui_language));
                      el.value = "";
                    }
                  }}
                  className="bg-white/10 px-4 py-3 rounded-lg hover:bg-white/20 transition whitespace-nowrap text-sm font-semibold text-white/90"
                >
                  {t("settings.update", profile.ui_language)}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  if (confirm(t("settings.deleteConfirm", profile.ui_language))) {
                    const { error } = await supabase.rpc("delete_user");
                    if (error) {
                      alert(t("settings.errorDelete", profile.ui_language) + error.message);
                    } else {
                      await supabase.auth.signOut();
                      window.location.href = "/login";
                    }
                  }
                }}
                className="w-full bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg px-4 py-3 hover:bg-red-500/20 transition font-semibold"
              >
                {t("settings.deleteAccount", profile.ui_language)}
              </button>
            </div>
          </div>
        </section>

        {/* Application Theme */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">
            {t("settings.aesthetics", profile.ui_language)}
          </h2>

          <div className="space-y-4">
            <label className="text-sm font-semibold text-arc-text/80">
              {t("settings.themeAccent", profile.ui_language)}
            </label>
            <div className="flex flex-wrap gap-4">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => updateSettings({ theme_accent: c.value })}
                  className={`h-12 w-12 rounded-full border-2 transition-transform hover:scale-110 ${profile.theme_accent === c.value ? "border-white scale-110 shadow-[0_0_20px_var(--arc-accent)]" : "border-transparent"}`}
                  style={{ background: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Profile Action */}
        <div className="flex justify-between items-center pt-8 border-t border-white/10">
          <button
            onClick={() => navigate({ to: "/profiles" })}
            className="text-arc-muted hover:text-white transition"
          >
            {t("settings.switchProfile", profile.ui_language)}
          </button>
          <button
            onClick={() => navigate({ to: "/browse" })}
            className="bg-arc-accent text-arc-void px-8 py-3 rounded-full font-bold hover:bg-white transition"
          >
            {t("settings.done", profile.ui_language)}
          </button>
        </div>
      </div>
    </div>
  );
}
