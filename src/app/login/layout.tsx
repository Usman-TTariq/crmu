import type { ReactNode } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/** Warm DNS/TLS to Supabase before the user submits credentials. */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {supabaseUrl ? (
        <>
          <link rel="dns-prefetch" href={supabaseUrl} />
          <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />
        </>
      ) : null}
      {children}
    </>
  );
}
