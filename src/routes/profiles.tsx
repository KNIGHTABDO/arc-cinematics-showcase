import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { avatarGradient } from "@/lib/gradients";
import { useCursorHover } from "@/lib/cursor-context";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useAuth } from "@/hooks/use-auth";
import { supabase, type Profile } from "@/lib/supabase";
import { useSettings } from "@/lib/store/settings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/profiles")({
  head: () => ({
    meta: [
      { title: "Who's watching? — ARC" },
    ],
  }),
  component: ProfilesPage,
});

function ProfilesPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const linkCursor = useCursorHover("link");
  const { session, user, loading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && !session && user === null) {
      navigate({ to: "/", replace: true });
    }
  }, [session, user, loading, navigate]);

  // Load profiles from Supabase (real-time subscription)
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    supabase.from("profiles").select("*").eq("user_id", user.id).then(({ data }) => {
      if (data && data.length > 0) setProfiles(data as Profile[]);
    });

    // Real-time subscription for live sync
    const channel = supabase
      .channel("profiles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, () => {
        // Re-fetch on any change
        supabase.from("profiles").select("*").eq("user_id", user.id).then(({ data }) => {
          if (data) setProfiles(data as Profile[]);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      if (containerRef.current) {
        gsap.fromTo(
          containerRef.current.querySelectorAll("[data-stagger]"),
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: "power3.out", delay: 0.4 }
        );
      }
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const { reloadProfile } = useSettings();

  const pick = (profile: Profile, btn: HTMLButtonElement) => {
    setPicking(profile.id);
    localStorage.setItem("arc_active_profile", profile.id);
    // Reload settings provider with the selected profile
    reloadProfile();

    if (prefersReducedMotion()) {
      navigate({ to: "/browse" });
      return;
    }
    gsap.to(btn, {
      scale: 0.9, duration: 0.15, ease: "power2.in",
      onComplete: () => {
        gsap.to(btn, {
          scale: 1.1, duration: 0.25, ease: "back.out(2)",
          onComplete: () => navigate({ to: "/browse" }),
        });
      },
    });
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm("Delete this profile? This cannot be undone.")) return;
    await supabase.from("profiles").delete().eq("id", profileId);
    setProfiles(prev => prev.filter(p => p.id !== profileId));
  };

  return (
    <main ref={containerRef} className="relative flex min-h-screen flex-col items-center justify-center bg-arc-void px-6 overflow-hidden">
      <div data-stagger className="absolute left-1/2 top-10 -translate-x-1/2">
        <Wordmark />
      </div>

      <div className="mb-14 text-center z-10">
        <SplitTextReveal
          text="Who's watching?"
          as="h1"
          className="font-display text-[clamp(40px,6vw,72px)] font-extrabold tracking-tight"
          stagger={0.025}
          delay={0.2}
        />
      </div>

      <div data-stagger className="flex flex-wrap items-start justify-center gap-8 md:gap-12 z-10">
        {profiles.map((p) => (
          <div key={p.id} className="relative group">
            <button
              onClick={(e) => pick(p, e.currentTarget)}
              {...linkCursor}
              className="flex flex-col items-center gap-4 focus-visible:outline-none"
            >
              <div className="relative h-24 w-24 md:h-28 md:w-28 overflow-hidden rounded-full">
                <div
                  className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 spin-ring"
                  style={{
                    background: `conic-gradient(from 0deg, ${p.is_kids ? 'oklch(0.75 0.14 150)' : 'var(--arc-accent)'}, ${p.is_kids ? 'oklch(0.85 0.15 80)' : 'var(--arc-accent-2)'}, ${p.is_kids ? 'oklch(0.75 0.14 150)' : 'var(--arc-accent)'})`,
                    padding: 3,
                    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
                <div
                  className="flex h-full w-full items-center justify-center rounded-full font-display text-2xl font-extrabold text-white/90 transition-transform duration-500 group-hover:scale-105"
                  style={{
                    background: p.avatar_url ? "none" : avatarGradient(p.name),
                    opacity: picking && picking !== p.id ? 0.4 : 1,
                  }}
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name} className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <>{p.name.substring(0, 2).toUpperCase()}</>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="label-caps text-arc-text/70 transition-colors group-hover:text-arc-accent">
                  {p.name}
                </span>
                {p.is_kids && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold uppercase tracking-wider">
                    Kids
                  </span>
                )}
              </div>
            </button>
            {/* Edit / Delete on hover */}
            <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition flex gap-1">
              <button
                onClick={() => { setEditProfile(p); setShowModal(true); }}
                className="h-6 w-6 rounded-full bg-arc-surface-2 border border-white/10 text-white/60 hover:text-white text-xs flex items-center justify-center"
                title="Edit"
              >✎</button>
              {profiles.length > 1 && (
                <button
                  onClick={() => handleDeleteProfile(p.id)}
                  className="h-6 w-6 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs flex items-center justify-center"
                  title="Delete"
                >×</button>
              )}
            </div>
          </div>
        ))}

        {/* Add profile — max 5 */}
        {profiles.length < 5 && (
          <button onClick={() => { setEditProfile(null); setShowModal(true); }} {...linkCursor} className="group flex flex-col items-center gap-4 focus-visible:outline-none">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-white/15 text-white/50 transition-all group-hover:border-arc-accent/60 group-hover:text-arc-accent md:h-28 md:w-28">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="label-caps text-arc-text/50">Add</span>
          </button>
        )}
      </div>

      <div data-stagger className="mt-14 text-center z-10 flex flex-col gap-4">
        <button
          onClick={() => supabase.auth.signOut().then(() => navigate({ to: '/' }))}
          className="text-xs text-arc-muted hover:text-red-400 transition"
        >
          Sign Out
        </button>
      </div>

      {/* Modal */}
      {showModal && <ProfileModal profile={editProfile} userId={user?.id || ""} onClose={() => { setShowModal(false); setEditProfile(null); }} onSaved={(p) => {
        if (editProfile) {
          setProfiles(prev => prev.map(x => x.id === p.id ? p : x));
        } else {
          setProfiles(prev => [...prev, p]);
        }
        setShowModal(false);
        setEditProfile(null);
      }} />}
    </main>
  );
}

function ProfileModal({ profile, userId, onClose, onSaved }: { profile: Profile | null; userId: string; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile?.name || "");
  const [isKids, setIsKids] = useState(profile?.is_kids || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    if (profile) {
      // Update existing
      const { data } = await supabase.from("profiles").update({ name, is_kids: isKids }).eq("id", profile.id).select().single();
      if (data) onSaved(data as Profile);
    } else {
      // Create new
      const { data } = await supabase.from("profiles").insert([{
        user_id: userId,
        name,
        is_kids: isKids,
        ui_language: "en",
        tmdb_language: "en-US",
        subtitle_language: "ar",
        video_quality: isKids ? "720p" : "1080p",
        theme_accent: isKids ? "oklch(0.75 0.14 150)" : "oklch(0.76 0.15 305)",
      }]).select().single();
      if (data) onSaved(data as Profile);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-arc-surface border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold mb-6">
          {profile ? "Edit Profile" : "Add Profile"}
        </h2>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-arc-text/80">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name..."
              className="w-full bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-arc-accent transition text-arc-text"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between bg-arc-surface-2 border border-white/10 rounded-lg px-4 py-3">
            <div>
              <div className="font-semibold text-sm">Kids Profile</div>
              <div className="text-xs text-arc-muted">Filtered content, safe browsing</div>
            </div>
            <button
              onClick={() => setIsKids(!isKids)}
              className={`w-12 h-6 rounded-full transition-colors ${isKids ? "bg-emerald-500" : "bg-white/10"}`}
            >
              <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${isKids ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-white/10 text-arc-muted hover:text-white transition font-semibold text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 py-3 rounded-lg bg-arc-accent text-arc-void font-bold text-sm hover:bg-white transition disabled:opacity-50">
            {saving ? "Saving..." : profile ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div className="font-display text-[28px] font-extrabold tracking-tight">
      <span className="text-arc-text">A</span>
      <span className="relative inline-block">
        R
        <span
          className="absolute -bottom-0 -right-1 h-1.5 w-1.5"
          style={{ background: "var(--arc-accent)", transform: "rotate(45deg)" }}
        />
      </span>
      <span className="text-arc-accent">C</span>
    </div>
  );
}
