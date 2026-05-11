"use client";

import type { ReactNode } from "react";

type LiveMobileShellProps = {
  header?: ReactNode;
  stage: ReactNode;
  afterStage?: ReactNode;
  footer?: ReactNode;
  sheets?: ReactNode;
  testId?: string;
};

export default function LiveMobileShell({
  header,
  stage,
  afterStage,
  footer,
  sheets,
  testId = "room-mobile-shell",
}: LiveMobileShellProps) {
  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden lg:h-full lg:rounded-3xl lg:border lg:border-white/70 lg:bg-white/60 lg:p-2 lg:shadow-[0_10px_30px_rgba(15,23,42,0.08)] lg:backdrop-blur-sm"
      data-testid={testId}
    >
      {header}
      <div className="relative min-h-0 flex-1 overflow-hidden p-1.5 lg:p-0">{stage}</div>
      {afterStage}
      {footer}
      {sheets}
    </div>
  );
}
