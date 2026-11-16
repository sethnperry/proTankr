"use client";

import { ReactNode, useEffect, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;

  /**
   * Footer content.
   * - undefined => show default Done button
   * - null      => hide footer entirely
   * - ReactNode => render that node
   */
  footer?: ReactNode | null;

  /** Optional content in the header's right slot (replaces the plain spacer). */
  headerRight?: ReactNode;

  /** Hides the header's "Close" text button. Backdrop click and Escape
   * still call onClose -- use this when the modal has its own single,
   * deliberate exit control (e.g. LoadingModal's bottom button) and a
   * second silent header exit would undercut it. */
  hideCloseButton?: boolean;
};

export function FullscreenModal({ open, title, onClose, children, footer, headerRight, hideCloseButton }: Props) {
  // With the keyboard up the visible area is shorter than the screen; follow it so the header and the
  // bottom controls both stay on screen instead of the panel being pushed off the top.
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const v = window.visualViewport;
    if (!v) return;
    const sync = () => setVv(window.innerHeight - v.height > 80 ? { top: v.offsetTop, height: v.height } : null);
    sync();
    v.addEventListener("resize", sync);
    v.addEventListener("scroll", sync);
    return () => { v.removeEventListener("resize", sync); v.removeEventListener("scroll", sync); setVv(null); };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const footerNode =
    footer === null ? null : footer ?? (
      <button
        onClick={onClose}
        className="w-full rounded-[2px] bg-white px-4 py-3 font-extrabold uppercase tracking-[0.06em] text-black hover:bg-white/90"
      >
        Done
      </button>
    );


  return (
    <div className="fixed inset-x-0 z-50" style={vv ? { top: vv.top, height: vv.height } : { top: 0, bottom: 0 }}>
      {/* Backdrop: dim + blur. Click backdrop to close */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating panel */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          className="flex w-full max-w-2xl flex-col rounded-[2px] border border-white/15 bg-[#0b0b0b] text-white shadow-2xl"
          style={{ height: vv ? "min(100%, 900px)" : "min(92dvh, 900px)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            {hideCloseButton ? (
              <div className="min-w-[64px]" />
            ) : (
              <button
                onClick={onClose}
                className="rounded-[2px] px-3 py-2 text-sm hover:bg-white/10"
                aria-label="Close"
              >
                Close
              </button>
            )}

            <div className="text-[13px] font-extrabold uppercase tracking-[0.16em]">{title}</div>

            <div className="min-w-[64px] flex justify-end">{headerRight}</div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>

          {/* Footer */}
          {footerNode !== null ? (
            <div className="shrink-0 border-t border-white/10 px-4 py-3">{footerNode}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
