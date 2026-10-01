"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <dialog> so focus trapping and Esc come from the platform rather
 * than from us reimplementing them badly.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  width = "560px",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={{ maxWidth: width }}
      className="glass w-[92vw] rounded-panel p-0 text-fg shadow-lift backdrop:bg-black/70 backdrop:backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-4">
        <div>
          {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
          <h2 className="title-black text-[22px]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="-mr-1 px-2 text-[22px] leading-none text-muted transition-colors hover:text-red"
        >
          ×
        </button>
      </div>
      <div className="scroll-slim max-h-[70vh] overflow-y-auto px-6 py-6">{children}</div>
    </dialog>
  );
}
