import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4v15M6.5 13.5 12 19l5.5-5.5" />
    </IconBase>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m15 5-7 7 7 7" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
      <path d="m9.4 12.2 1.7 1.7 3.7-4" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </IconBase>
  );
}

export function SignalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19v-3M10 19v-7M15 19V8M20 19V4" />
    </IconBase>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m13.5 2-8 12h6l-1 8 8-12h-6l1-8Z" />
    </IconBase>
  );
}

export function TvIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="m9 3 3 3 3-3" />
    </IconBase>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 3h3l1.4 4-2.1 1.4a13.5 13.5 0 0 0 6.3 6.3l1.4-2.1 4 1.4v3a4 4 0 0 1-4 4C9.3 20 4 14.7 3 8a4 4 0 0 1 4-5Z" />
    </IconBase>
  );
}
