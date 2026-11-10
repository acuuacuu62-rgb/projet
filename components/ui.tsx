"use client";
import {
  X,
  AlertTriangle,
  LoaderCircle,
  Server,
  ArrowUpRight,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
export function Logo({ size = 29 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="logo"
      aria-hidden="true"
    >
      <path
        d="M4 6h23l-3 6H13L6 25h22l-3-6H14l7-13"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
      <path
        d="M7 29h20M4 3h20"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity=".4"
      />
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const style = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          'button,a[href],input,select,textarea,[tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = style;
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Notice({
  children,
  info = false,
}: {
  children: ReactNode;
  info?: boolean;
}) {
  return (
    <div className={`notice ${info ? "info" : ""}`}>
      <AlertTriangle />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
  large = false,
  icon,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  large?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`empty-state ${large ? "large-empty" : ""}`}>
      <div className="empty-icon">{icon || <Server />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Busy({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {busy && <LoaderCircle size={14} className="spin" />}
      {children}
    </>
  );
}
export function Badge({ status }: { status: string }) {
  const color = ["Completed", "verified", "online", "pass", "active"].includes(
    status,
  )
    ? "green"
    : ["Failed", "mismatch", "fail", "offline"].includes(status)
      ? "red"
      : ["Pending", "unknown", "unverified"].includes(status)
        ? "orange"
        : "purple";
  return (
    <span className={`pill ${color}`}>
      <i />
      {status}
    </span>
  );
}
export function DocsLink({
  topic = 0,
  children = "Read documentation",
}: {
  topic?: number;
  children?: ReactNode;
}) {
  return (
    <Link href={`/documentation?article=${topic}`} className="text-link">
      {children}
      <ArrowUpRight size={12} />
    </Link>
  );
}
