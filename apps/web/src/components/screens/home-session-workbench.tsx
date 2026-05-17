"use client";

import type { ReactNode } from "react";

/** Orders the ask composer and active run without owning their state. */
export function HomeSessionWorkbench(props: {
  activeSessionId: number | null;
  inspector: ReactNode;
  composer: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Ask</h1>
      {props.activeSessionId ? (
        <>
          {props.inspector}
          {props.composer}
        </>
      ) : (
        <>
          {props.composer}
          {props.inspector}
        </>
      )}
    </div>
  );
}
