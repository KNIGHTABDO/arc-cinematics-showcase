import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { useCursorHover } from "@/lib/cursor-context";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const linkCursor = useCursorHover("link");
  const navigate = useNavigate();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    
    const ctx = gsap.context(() => {
      if (containerRef.current) {
        gsap.fromTo(
          containerRef.current.querySelectorAll(".fade-up"),
          { y: 20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.1,
            ease: "power3.out",
          }
        );
      }
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate({ to: "/profiles" });
    }
  };

  return (
    <main ref={containerRef} className="flex min-h-screen items-center justify-center bg-arc-void px-6">
      <Link to="/" className="absolute left-8 top-8 font-display text-2xl font-extrabold fade-up" {...linkCursor}>
        ARC
      </Link>
      
      <div className="w-full max-w-md">
        <h1 className="mb-2 font-display text-4xl font-extrabold tracking-tight text-arc-text fade-up">
          Welcome back
        </h1>
        <p className="mb-8 text-arc-text/60 fade-up">Please enter your details to sign in.</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="fade-up">
            <label className="mb-2 block text-sm font-medium text-arc-text/80">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 py-3 px-4 text-arc-text placeholder:text-arc-text/30 focus:border-arc-accent focus:outline-none focus:ring-1 focus:ring-arc-accent transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div className="fade-up">
            <label className="mb-2 block text-sm font-medium text-arc-text/80">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 py-3 px-4 text-arc-text placeholder:text-arc-text/30 focus:border-arc-accent focus:outline-none focus:ring-1 focus:ring-arc-accent transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-500 fade-up">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            {...linkCursor}
            className="mt-4 w-full rounded-lg bg-arc-accent py-3.5 font-bold tracking-wide text-arc-void transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 fade-up"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-arc-text/50 fade-up">
          Don't have an account?{" "}
          <Link to="/register" className="text-arc-accent hover:underline" {...linkCursor}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
