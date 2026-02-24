import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>
          <p style={{ marginTop: 12 }}>Loading…</p>
        </main>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}