"use client";
// lib/ui/KeypadToggle.tsx
//
// Reference numbers (order #, BOL #) are usually digits but sometimes have
// letters. The field opens on the number pad; the small "ABC" / "123"
// button switches the phone's keyboard. Changing inputMode on a focused
// field doesn't swap the keyboard until it refocuses, so the toggle does that.

import React, { useState } from "react";

export function useKeypadMode() {
  const [alpha, setAlpha] = useState(false);
  return { alpha, setAlpha };
}

// Props to spread onto the <input>.
export function keypadInputProps(alpha: boolean) {
  return {
    type: "text",
    inputMode: (alpha ? "text" : "numeric") as React.HTMLAttributes<HTMLInputElement>["inputMode"],
    pattern: alpha ? undefined : "[0-9]*",
    autoCapitalize: alpha ? "characters" : undefined,
    autoCorrect: "off",
  };
}

export function KeypadToggle({
  alpha,
  onToggle,
  inputRef,
  style,
}: {
  alpha: boolean;
  onToggle: (next: boolean) => void;
  inputRef?: React.RefObject<HTMLInputElement | null> | { current: HTMLInputElement | null };
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      // Keep focus in the field while tapping.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onToggle(!alpha);
        const el = inputRef?.current;
        if (el) {
          el.blur();
          setTimeout(() => el.focus(), 30);
        }
      }}
      style={{
        border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.8)", borderRadius: 2, padding: "4px 8px",
        fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: "pointer", ...style,
      }}
      aria-label={alpha ? "Number keypad" : "Letter keyboard"}
    >
      {alpha ? "123" : "ABC"}
    </button>
  );
}
