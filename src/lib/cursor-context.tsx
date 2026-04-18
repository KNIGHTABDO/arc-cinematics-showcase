import { createContext, useContext, useState, type ReactNode } from "react";

type CursorState = "default" | "link" | "card";

interface CursorContextValue {
  state: CursorState;
  setState: (s: CursorState) => void;
}

const CursorContext = createContext<CursorContextValue>({
  state: "default",
  setState: () => {},
});

export function CursorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CursorState>("default");
  return (
    <CursorContext.Provider value={{ state, setState }}>{children}</CursorContext.Provider>
  );
}

export function useCursor() {
  return useContext(CursorContext);
}

export function useCursorHover(state: CursorState = "link") {
  const { setState } = useCursor();
  return {
    onMouseEnter: () => setState(state),
    onMouseLeave: () => setState("default"),
  };
}
