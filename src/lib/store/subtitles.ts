import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SubtitlesState {
  subStyleColor: string;
  subStyleBackground: string;
  subStyleSize: string;
  subStyleEdge: string;

  setSubStyleColor: (color: string) => void;
  setSubStyleBackground: (bg: string) => void;
  setSubStyleSize: (size: string) => void;
  setSubStyleEdge: (edge: string) => void;
}

export const useSubtitlesStore = create<SubtitlesState>()(
  persist(
    (set) => ({
      subStyleColor: "white",
      subStyleBackground: "rgba(0,0,0,0.75)",
      subStyleSize: "1.2em",
      subStyleEdge: "0px 1px 4px rgba(0,0,0,0.8), 0px 2px 12px rgba(0,0,0,0.8)",

      setSubStyleColor: (color) => set({ subStyleColor: color }),
      setSubStyleBackground: (bg) => set({ subStyleBackground: bg }),
      setSubStyleSize: (size) => set({ subStyleSize: size }),
      setSubStyleEdge: (edge) => set({ subStyleEdge: edge }),
    }),
    {
      name: "arc-subtitles-storage",
    }
  )
);
