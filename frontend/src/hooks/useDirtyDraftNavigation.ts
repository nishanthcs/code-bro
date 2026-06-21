import { useEffect, useRef } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";

const LEAVE_MESSAGE = "Leave without saving your latest changes?";

export function useDirtyDraftNavigation({
  isDirty,
  saveNow,
  abandon,
}: {
  isDirty: boolean;
  saveNow: () => Promise<boolean>;
  abandon: () => void;
}) {
  const handlingRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
  );

  useBeforeUnload(
    (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    { capture: true },
  );

  useEffect(() => {
    if (blocker.state !== "blocked" || handlingRef.current) return;
    handlingRef.current = true;
    let active = true;

    void saveNow()
      .then((saved) => {
        if (!active) return;
        if (saved) {
          blocker.proceed();
          return;
        }
        if (window.confirm(LEAVE_MESSAGE)) {
          abandon();
          blocker.proceed();
        } else {
          blocker.reset();
        }
      })
      .finally(() => {
        handlingRef.current = false;
      });

    return () => {
      active = false;
    };
  }, [abandon, blocker, saveNow]);
}
