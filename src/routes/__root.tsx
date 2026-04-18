import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { CursorProvider } from "@/lib/cursor-context";
import { LenisProvider } from "@/lib/lenis";
import { CustomCursor } from "@/components/cursor/CustomCursor";
import { FilmGrain } from "@/components/layout/FilmGrain";
import { CommandPalette } from "@/components/overlays/CommandPalette";
import { IntroLoader } from "@/components/overlays/IntroLoader";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-arc-void px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold text-arc-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-arc-text/90">Signal lost</h2>
        <p className="mt-2 text-sm text-arc-muted">
          The page you're looking for has drifted out of frame.
        </p>
        <div className="mt-6">
          <Link
            to="/browse"
            className="inline-flex items-center justify-center rounded-full bg-arc-accent px-5 py-2.5 text-sm font-medium text-arc-void transition-colors hover:bg-arc-accent/90"
          >
            Return to ARC
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ARC — Cinematic Streaming" },
      {
        name: "description",
        content:
          "ARC is a cinematic streaming platform for award-winning films, limited series, and documentary shorts.",
      },
      { name: "author", content: "ARC" },
      { name: "theme-color", content: "#080808" },
      { property: "og:title", content: "ARC — Cinematic Streaming" },
      { property: "og:description", content: "Award-winning films, series and shorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <CursorProvider>
      <LenisProvider>
        <IntroLoader />
        <FilmGrain />
        <CustomCursor />
        <CommandPalette />
        <Outlet />
      </LenisProvider>
    </CursorProvider>
  );
}
