'use client';

import useSettings from '@/hooks/useSettings';

export default function HeartBeat({ onClick }: { onClick?: () => void }) {
  const { settings } = useSettings();
  if (!settings.showHeart) return null;

  // Once the user has tapped through the welcome at least once, the heart
  // turns into a subtle bouncing up-arrow (the gallery sheet rises from
  // below, so an up-arrow communicates "tap to open").
  const opened = settings.welcomed;

  return (
    <button
      type="button"
      className={`heart-btn ${opened ? 'mode-arrow' : 'mode-heart'}`}
      onClick={onClick}
      aria-label={opened ? 'open gallery' : 'open the gallery for the first time'}
    >
      {opened ? (
        <svg
          viewBox="0 0 9 11"
          shapeRendering="crispEdges"
          className="arrow-svg"
          aria-hidden="true"
        >
          <rect x="4" y="0" width="1" height="1" />
          <rect x="3" y="1" width="3" height="1" />
          <rect x="2" y="2" width="5" height="1" />
          <rect x="1" y="3" width="7" height="1" />
          <rect x="0" y="4" width="9" height="1" />
          <rect x="4" y="5" width="1" height="6" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 11 9"
          shapeRendering="crispEdges"
          className="heart-svg"
          aria-hidden="true"
        >
          <rect x="1" y="0" width="3" height="1" />
          <rect x="7" y="0" width="3" height="1" />
          <rect x="0" y="1" width="5" height="1" />
          <rect x="6" y="1" width="5" height="1" />
          <rect x="0" y="2" width="11" height="2" />
          <rect x="1" y="4" width="9" height="1" />
          <rect x="2" y="5" width="7" height="1" />
          <rect x="3" y="6" width="5" height="1" />
          <rect x="4" y="7" width="3" height="1" />
          <rect x="5" y="8" width="1" height="1" />
        </svg>
      )}
      {!opened && <span className="heart-label">{settings.heartLabel}</span>}
    </button>
  );
}
