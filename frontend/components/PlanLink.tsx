"use client";

import { PLAN_EVENT } from "@/lib/plans";

export default function PlanLink({
  planId,
  className,
  children,
}: {
  planId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#inscription"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: planId }))}
    >
      {children}
    </a>
  );
}
