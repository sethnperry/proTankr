"use client";
import ErrorScreen from "./ErrorScreen";

// Catches a crash in the root layout itself, so it has to bring its own <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111" }}>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
