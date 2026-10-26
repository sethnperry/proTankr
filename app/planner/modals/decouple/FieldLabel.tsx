"use client";
// app/planner/modals/decouple/FieldLabel.tsx
//
// Part of DecoupleModal.tsx.

import React from "react";

import { D } from "./helpers";

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={D.label}>{children}</label>;
}
