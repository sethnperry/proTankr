// app/join/page.tsx
import { Suspense } from "react";
import JoinClient from "./JoinClient";

export default function JoinPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, opacity: 0.8 }}>Loading…</div>}>
      <JoinClient />
    </Suspense>
  );
}