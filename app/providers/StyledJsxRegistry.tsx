"use client";
// app/providers/StyledJsxRegistry.tsx
//
// Puts every <style jsx> block into the server's first HTML instead of
// injecting it from JavaScript after the page loads.
//
// Why this exists: the app router doesn't flush styled-jsx on the server unless
// a registry is wired in. Without one, the server sends the page with NO styles
// and the browser paints it as plain unstyled text on the dark page background
// (nav links run together, no layout) until the JS bundle runs and injects the
// CSS. On a phone that read as a black screen full of code flashing before the
// real page appeared. This is the Next.js-documented recipe: collect the styles
// during the server render and emit them with useServerInsertedHTML.
//
// Every <style jsx> in this codebase is `global`, so this only changes WHERE
// the CSS arrives, not what it does.

import React, { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

export default function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  const [registry] = useState(() => createStyleRegistry());
  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });
  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}
