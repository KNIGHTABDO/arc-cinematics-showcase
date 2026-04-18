import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSettings } from "@/lib/store/settings";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";

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
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Profile Settings</h1>
          <p className="text-arc-muted mt-2">Manage preferences for {profile.name}'s viewing experience.</p>
        </div>

        {/* Global Settings */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">Localization</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80">UI Language</label>
              <select 
                className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition"
                value={profile.ui_language}
                onChange={(e) => updateSettings({ ui_language: e.target.value, tmdb_language: e.target.value === 'ar' ? 'ar-SA' : e.target.value === 'fr' ? 'fr-FR' : 'en-US' })}
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="fr">Français (French)</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-arc-text/80">Default Subtitles (Real-Debrid)</label>
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
              <label className="text-sm font-semibold text-arc-text/80">Default Video Quality</label>
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

        {/* Application Theme */}
        <section className="space-y-6 arc-card p-6 md:p-8">
          <h2 className="font-display text-2xl font-bold">Aesthetics</h2>
          
          <div className="space-y-4">
             <label className="text-sm font-semibold text-arc-text/80">Theme Accent Color</label>
             <div className="flex flex-wrap gap-4">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c.name}
                    onClick={() => updateSettings({ theme_accent: c.value })}
                    className={`h-12 w-12 rounded-full border-2 transition-transform hover:scale-110 ${profile.theme_accent === c.value ? 'border-white scale-110 shadow-[0_0_20px_var(--arc-accent)]' : 'border-transparent'}`}
                    style={{ background: c.value }}
                    title={c.name}
                  />
                ))}
             </div>
          </div>
        </section>
        
        {/* Profile Action */}
        <div className="flex justify-between items-center pt-8 border-t border-white/10">
           <button onClick={() => navigate({ to: "/profiles" })} className="text-arc-muted hover:text-white transition">
             Switch Profile
           </button>
           <button onClick={() => navigate({ to: "/browse" })} className="bg-arc-accent text-arc-void px-8 py-3 rounded-full font-bold hover:bg-white transition">
             Done
           </button>
        </div>

      </div>
    </div>
  );
}
