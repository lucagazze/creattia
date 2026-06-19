import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const PortalOverlay = ({ children }: { children: React.ReactNode }) => {
  const hasDocument = typeof document !== 'undefined';

  useEffect(() => {
    if (!hasDocument) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;
    const openCount = Number(body.dataset.portalOverlayCount || '0') + 1;
    body.dataset.portalOverlayCount = String(openCount);
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      const nextCount = Math.max(0, Number(body.dataset.portalOverlayCount || '1') - 1);
      if (nextCount === 0) {
        delete body.dataset.portalOverlayCount;
        body.style.overflow = previousOverflow;
        body.style.overscrollBehavior = previousOverscroll;
      } else {
        body.dataset.portalOverlayCount = String(nextCount);
      }
    };
  }, [hasDocument]);

  if (!hasDocument) return null;

  return createPortal(
    <div className="portal-overlay-root">
      {children}
    </div>,
    document.body
  );
};
