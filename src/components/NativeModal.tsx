import type { ReactElement } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface NativeModalProps {
  allowBackdropClose?: boolean;
  children: ReactElement;
  className?: string;
  onClose?: () => void;
  open: boolean;
}

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export const NativeModal = ({ allowBackdropClose = false, children, className, onClose, open }: NativeModalProps) => {
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeFromEffect = useEffectEvent(() => {
    if (!onClose) {
      return false;
    }
    onClose();
    return true;
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !open) {
      return;
    }

    const root = rootRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const autofocusTarget = root?.querySelector<HTMLElement>("[autofocus]");
      const firstControl = root?.querySelector<HTMLElement>(focusableSelector);
      (autofocusTarget ?? firstControl ?? root)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted || !open) {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeFromEffect()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const controls = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
      if (controls.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [mounted, open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      ref={rootRef}
      className={["messages-modal-root", className].filter(Boolean).join(" ")}
      data-modal-open="true"
      role="presentation"
      tabIndex={-1}
    >
      {allowBackdropClose && onClose ? (
        <button
          aria-hidden="true"
          className="messages-modal-backdrop-layer"
          tabIndex={-1}
          type="button"
          onClick={onClose}
        />
      ) : (
        <div className="messages-modal-backdrop-layer" aria-hidden="true" />
      )}
      <div className="messages-modal-content-layer" role="presentation">
        {children}
      </div>
    </div>,
    document.body,
  );
};
