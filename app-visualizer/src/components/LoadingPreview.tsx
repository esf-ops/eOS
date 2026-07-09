type LoadingPreviewProps = {
  roomPreview: string;
};

export function LoadingPreview({ roomPreview }: LoadingPreviewProps) {
  return (
    <div className="viz-loading" role="status" aria-live="polite">
      <div className="viz-loading-frame">
        <img src={roomPreview} alt="Your kitchen" className="viz-loading-image" draggable={false} />
        <div className="viz-loading-shimmer" aria-hidden />
        <div className="viz-loading-overlay">
          <span className="viz-loading-ring" aria-hidden />
          <p className="viz-loading-title">Generating your concept preview…</p>
          <p className="viz-loading-sub">This usually takes a few seconds.</p>
        </div>
      </div>
    </div>
  );
}
