"use client";

import { useEffect, type ReactNode } from "react";
import { IconX } from "./icons";

function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

interface PanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly desc?: string | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

function PanelInner({ title, desc, children, footer, onClose }: Omit<PanelProps, "open">) {
  return (
    <>
      <div className="wb-panel__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="wb-panel__title">{title}</h2>
          {desc && <p className="wb-panel__desc">{desc}</p>}
        </div>
        <button type="button" className="wb-iconbtn" onClick={onClose} aria-label="关闭">
          <IconX size={18} />
        </button>
      </div>
      <div className="wb-panel__body">{children}</div>
      {footer && <div className="wb-panel__foot">{footer}</div>}
    </>
  );
}

export function Drawer(props: PanelProps): React.ReactElement | null {
  useEscape(props.open, props.onClose);
  if (!props.open) return null;
  return (
    <div
      className="wb-overlay wb-overlay--right"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="wb-drawer" role="dialog" aria-modal="true" aria-label={props.title}>
        <PanelInner {...props} />
      </div>
    </div>
  );
}
