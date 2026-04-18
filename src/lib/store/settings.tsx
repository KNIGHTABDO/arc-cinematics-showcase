import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { setTMDBLanguage } from "@/lib/server/tmdb";

interface SettingsContextType {
  profile: Profile | null;
  lang: string;
  loading: boolean;
  updateSettings: (updates: Partial<Profile>) => Promise<void>;
  reloadProfile: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  profile: null,
  lang: "en",
  loading: true,
  updateSettings: async () => {},
  reloadProfile: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = (p: Profile) => {
    setProfile(p);

    // RTL
    document.documentElement.dir = p.ui_language === "ar" ? "rtl" : "ltr";

    // Theme accent
    if (p.theme_accent) {
      document.documentElement.style.setProperty("--arc-accent", p.theme_accent);
    }

    // TMDB language for server-side requests
    if (p.tmdb_language) {
      setTMDBLanguage(p.tmdb_language);
    }
  };

  const loadProfile = () => {
    const activeId = localStorage.getItem("arc_active_profile");
    if (!activeId || !user) {
      setLoading(false);
      return;
    }

    supabase
      .from("profiles")
      .select("*")
      .eq("id", activeId)
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (data) {
          applyProfile(data as Profile);
        } else if (error) {
          console.error("[ARC] Failed to load profile:", error.message);
        }
        setLoading(false);
      });
  };

  // Load profile on mount or when user changes
  useEffect(() => {
    loadProfile();
  }, [user]);

  // Listen for profile switches via storage event (multi-tab sync)
  useEffect(() => {
    const handler = () => loadProfile();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [user]);

  const updateSettings = async (updates: Partial<Profile>) => {
    if (!profile) return;

    // Optimistic UI update
    const newProfile = { ...profile, ...updates };
    applyProfile(newProfile);

    // Persist to Supabase
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);
    if (error) console.error("[ARC] settings update error:", error.message);
  };

  const reloadProfile = () => {
    setLoading(true);
    loadProfile();
  };

  return (
    <SettingsContext.Provider value={{ profile, lang: profile?.ui_language || "en", loading, updateSettings, reloadProfile }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
