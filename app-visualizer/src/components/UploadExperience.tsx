import { useState } from "react";
import { HERO_HEADLINE, HERO_SUPPORTING } from "../lib/config";
import { DEMO_ROOMS, type DemoRoom } from "../lib/samples";

type UploadExperienceProps = {
  maxUploadMb: number;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  onDemoRoomSelected: (room: DemoRoom) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  eyebrow?: string;
  heroHeadline?: string;
  heroSupporting?: string;
  /** Defaults to Elite Stone demo rooms; Cambria mode passes Cambria-only scenes. */
  demoRooms?: DemoRoom[];
};

export function UploadExperience({
  maxUploadMb,
  disabled = false,
  onFileSelected,
  onDemoRoomSelected,
  fileInputRef,
  eyebrow = "Elite 100 · Concept Preview",
  heroHeadline = HERO_HEADLINE,
  heroSupporting = HERO_SUPPORTING,
  demoRooms = DEMO_ROOMS,
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
        <p className="viz-eyebrow">{eyebrow}</p>
        <h1 id="viz-upload-title" className="viz-hero-title">
          {heroHeadline}
        </h1>
        <p className="viz-hero-sub">{heroSupporting}</p>
      </div>

      {/* Accept a broad image/* set so iOS shows the full photo library.
          HEIC/HEIF files selected here are decoded and normalized to JPEG by
          imageNormalize.ts before any upload — the backend only ever sees JPEG. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          // Reset value so re-selecting the same file still fires onChange.
          e.target.value = "";
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
        <p className="viz-dropzone-title">Upload a kitchen photo</p>
        <p className="viz-dropzone-sub">Choose from your camera roll or files</p>
        <span className="viz-btn viz-btn-primary viz-dropzone-cta">Choose photo</span>
        <p className="viz-dropzone-note">JPG, PNG, or any photo · up to {maxUploadMb} MB</p>
        <p className="viz-dropzone-hint-desktop">or drag and drop</p>
      </div>

      <div className="viz-demo-row">
        <span className="viz-demo-label">No photo handy?</span>
        <div className="viz-demo-options">
          {demoRooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className="viz-demo-chip"
              disabled={disabled}
              title={room.subtitle || room.label}
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
