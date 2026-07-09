import { useState } from "react";
import { HERO_HEADLINE, HERO_SUPPORTING } from "../lib/config";
import { DEMO_ROOMS } from "../lib/samples";

type UploadExperienceProps = {
  maxUploadMb: number;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  onDemoRoomSelected: (room: (typeof DEMO_ROOMS)[number]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function UploadExperience({
  maxUploadMb,
  disabled = false,
  onFileSelected,
  onDemoRoomSelected,
  fileInputRef,
}: UploadExperienceProps) {
  const [dragActive, setDragActive] = useState(false);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <section className="viz-upload" aria-labelledby="viz-upload-title">
      <div className="viz-upload-intro">
        <p className="viz-eyebrow">Elite 100 · Concept Preview</p>
        <h1 id="viz-upload-title" className="viz-hero-title">
          {HERO_HEADLINE}
        </h1>
        <p className="viz-hero-sub">{HERO_SUPPORTING}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />

      <div
        className={`viz-dropzone${dragActive ? " is-dragging" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        aria-disabled={disabled}
      >
        <div className="viz-dropzone-icon" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="viz-dropzone-title">Drag &amp; drop your kitchen photo</p>
        <p className="viz-dropzone-sub">or browse from your device</p>
        <span className="viz-btn viz-btn-primary viz-dropzone-cta">Choose photo</span>
        <p className="viz-dropzone-note">JPG or PNG · up to {maxUploadMb} MB</p>
      </div>

      <div className="viz-demo-row">
        <span className="viz-demo-label">No photo handy?</span>
        <div className="viz-demo-options">
          {DEMO_ROOMS.map((room) => (
            <button
              key={room.id}
              type="button"
              className="viz-demo-chip"
              disabled={disabled}
              onClick={() => onDemoRoomSelected(room)}
            >
              <img src={room.imageUrl} alt="" loading="lazy" />
              <span>{room.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
