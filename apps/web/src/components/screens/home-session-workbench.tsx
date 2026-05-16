"use client";

import type { ReactNode } from "react";

/** Orders the petition desk and active manuscript without owning their state. */
export function HomeSessionWorkbench(props: {
  activeSessionId: number | null;
  inspector: ReactNode;
  composer: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Petition Desk</h1>
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
