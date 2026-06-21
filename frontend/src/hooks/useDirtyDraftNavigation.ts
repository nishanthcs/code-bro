import { useEffect, useLayoutEffect, useRef } from "react";
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
  const mountedRef = useRef(true);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
  );
  const blockerRef = useRef(blocker);

  useLayoutEffect(() => {
    blockerRef.current = blocker;
  }, [blocker]);

  useBeforeUnload(
    (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    { capture: true },
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (blocker.state !== "blocked" || handlingRef.current) return;
    handlingRef.current = true;
    let savedSuccessfully = false;

    void saveNow()
      .then((saved) => {
        if (!mountedRef.current) return;
        if (saved) {
          savedSuccessfully = true;
          const currentBlocker = blockerRef.current;
          if (currentBlocker.state === "blocked") {
            try {
              currentBlocker.proceed();
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !error.message.includes(
                  "Invalid blocker state transition: unblocked -> proceeding",
                )
              ) {
                throw error;
              }
            }
          }
          return;
        }
        const currentBlocker = blockerRef.current;
        if (currentBlocker.state !== "blocked") return;
        if (window.confirm(LEAVE_MESSAGE)) {
          abandon();
          currentBlocker.proceed();
        } else {
          currentBlocker.reset();
        }
      })
      .finally(() => {
        if (!savedSuccessfully) {
          handlingRef.current = false;
        }
      });
  }, [abandon, blocker, saveNow]);
}
