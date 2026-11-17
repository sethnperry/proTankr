"use client";
// app/planner/modals/loading/useFinishLeave.ts
//
// Backing out of the first Finish Loading window. On a trip the Finish Loading time was stamped when the driver tapped
// it, so ask whether to keep it or undo it; off a trip there is nothing stamped, so just back out.

import { useState } from "react";

export function useFinishLeave(o: { onTrip: boolean; editing: boolean; getStamp?: () => string | null; undoStamp?: () => void; leave: () => void }) {
  const [finishAsk, setFinishAsk] = useState(false);
  return {
    finishAsk,
    setFinishAsk,
    getFinishStamp: o.getStamp,
    askLeaveFinish: () => { if (o.onTrip && !o.editing && o.getStamp?.()) setFinishAsk(true); else o.leave(); },
    keepFinishStamp: () => { setFinishAsk(false); o.leave(); },
    undoFinishStamp: () => { o.undoStamp?.(); setFinishAsk(false); o.leave(); },
  };
}
