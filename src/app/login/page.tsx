"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { signIn } from "@/actions/auth";
import { C } from "@/lib/theme";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 14,
    color: C.ink,
    background: C.surface,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(160deg, #4A060F 0%, #7E0E1F 48%, #B01226 100%)",
        padding: 20,
      }}
    >
      <div
        className="crm-card fade-up"
        style={{
          background: C.surface,
          borderRadius: 18,
          padding: "34px 32px",
          width: 400,
          maxWidth: "94vw",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              margin: "0 auto 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg,#D2203A,#A6112A)",
              color: "#fff",
              boxShadow: "0 8px 20px rgba(196,19,47,0.35)",
            }}
          >
            <Lock size={24} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>TGT Nexus</div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.inkSoft,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              marginTop: 4,
            }}
          >
            POS Operations CRM
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: C.inkSoft,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 5,
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: C.inkSoft,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 5,
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          {error ? (
            <div
              style={{
                fontSize: 12.5,
                color: "#AE3A44",
                background: "#FAE7E8",
                borderRadius: 8,
                padding: "8px 11px",
              }}
            >
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="btnp"
            style={{
              border: "none",
              background: "linear-gradient(180deg,#D2203A,#A6112A)",
              color: "#fff",
              borderRadius: 10,
              padding: "12px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
              boxShadow: "0 6px 16px rgba(196,19,47,0.28)",
            }}
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
