"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Cormorant_Garamond, IBM_Plex_Sans } from "next/font/google";
import { signIn } from "@/actions/auth";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-login-display",
});

const ui = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-login-ui",
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await signIn({ email, password });
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  };

  return (
    <div className={`${display.variable} ${ui.variable} login-shell`}>
      <div className="login-atmosphere" aria-hidden>
        <div className="login-wash" />
        <div className="login-panel-dark" />
        <div className="login-grid" />
        <div className="login-glow" />
        <div className="login-glow-soft" />
        <div className="login-noise" />
        <div className="login-giant">NEXUS</div>
      </div>

      <div className="login-frame">
        <aside className="login-brand-col login-rise" style={{ animationDelay: "0.06s" }}>
          <div className="login-brand-top">
            <div className="login-logo-lockup">
              <div className="login-logo-plate">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-mark-light.svg" alt="" className="login-logo-mark" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-type-light.svg" alt="TGT Nexus" className="login-logo-type" />
            </div>
          </div>

          <div className="login-brand-main">
            <div className="login-kicker">
              <span className="login-kicker-dot" aria-hidden />
              POS Operations CRM
            </div>
            <h1 className="login-headline">
              From first lead
              <em>to live install.</em>
            </h1>
            <p className="login-lede">
              One workspace for sales and ops — shared pipeline, clear ownership, zero guesswork.
            </p>

            <div className="login-rail" aria-label="Pipeline">
              {[
                ["01", "Lead"],
                ["02", "QA"],
                ["03", "SQL"],
                ["04", "Close"],
                ["05", "Ops"],
              ].map(([n, label]) => (
                <div key={label} className="login-rail-step">
                  <span className="login-rail-num">{n}</span>
                  <span className="login-rail-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="login-brand-foot">
            <div className="login-foot-rule" aria-hidden />
            <div className="login-foot-row">
              <span>Secure team access</span>
              <span className="login-sep" aria-hidden />
              <span>Authorized only</span>
            </div>
          </div>
        </aside>

        <main className="login-auth-col login-rise" style={{ animationDelay: "0.16s" }}>
          <div className="login-auth">
            <header className="login-auth-head">
              <h2>Sign in</h2>
              <p>Enter the credentials issued by your administrator.</p>
            </header>

            <form onSubmit={submit} className="login-form" noValidate>
              <label className="login-label" htmlFor="login-email">
                Email address
              </label>
              <input
                id="login-email"
                className="login-control"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@tgtnexus.net"
              />

              <div className="login-label-row">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <button
                  type="button"
                  className="login-ghost"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="login-password"
                className="login-control"
                type={showPw ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />

              {error ? (
                <div className="login-error" role="alert">
                  {error}
                </div>
              ) : null}

              <button type="submit" className="login-cta" disabled={busy}>
                {busy ? "Authenticating…" : "Enter workspace"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
