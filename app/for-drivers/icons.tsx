// app/for-drivers/icons.tsx
// Small monochrome stroke icons for the driver checklist -- same house
// style as the real app's own icon set (CalculatorLayoutClient.tsx's
// BellIcon/GearIcon, PlannerIcons.tsx's SolidPinIcon): plain Feather-shape
// paths, viewBox 0 0 24 24, round caps/joins, currentColor.

function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function CardIcon() {
  return (
    <Base>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="6" y1="14.5" x2="11" y2="14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  );
}

export function CompartmentsIcon() {
  return (
    <Base>
      <rect x="2.5" y="4" width="19" height="16" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <line x1="8.3" y1="4" x2="8.3" y2="20" stroke="currentColor" strokeWidth="1.8" />
      <line x1="15.7" y1="4" x2="15.7" y2="20" stroke="currentColor" strokeWidth="1.8" />
    </Base>
  );
}

export function WrenchIcon() {
  return (
    <Base>
      <path
        d="M14.7 6.3a4.5 4.5 0 0 0-5.9 5.4L3.5 17a1.9 1.9 0 0 0 2.7 2.7l5.3-5.3a4.5 4.5 0 0 0 5.4-5.9l-3.1 3.1-2.3-2.3 3.2-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Base>
  );
}

export function ShareIcon() {
  return (
    <Base>
      <circle cx="18" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="18.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <line x1="8.2" y1="10.7" x2="15.8" y2="6.8" stroke="currentColor" strokeWidth="1.7" />
      <line x1="8.2" y1="13.3" x2="15.8" y2="17.2" stroke="currentColor" strokeWidth="1.7" />
    </Base>
  );
}
