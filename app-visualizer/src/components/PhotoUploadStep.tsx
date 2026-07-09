import { DEMO_ROOMS } from "../lib/samples";

type PhotoUploadStepProps = {
  maxUploadMb: number;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  onDemoRoomSelected: (room: (typeof DEMO_ROOMS)[number]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export function PhotoUploadStep({
  maxUploadMb,
  disabled = false,
  onFileSelected,
  onDemoRoomSelected,
  fileInputRef,
}: PhotoUploadStepProps) {
  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <section className="wizard-card">
      <header className="wizard-card-head">
        <h2>Upload a photo of your kitchen</h2>
        <p>Use a well-lit photo showing your countertops and cabinets.</p>
      </header>

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
        className="upload-dropzone"
        role="button"
        tabIndex={0}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        aria-disabled={disabled}
      >
        <div className="upload-dropzone-icon" aria-hidden>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="upload-dropzone-title">Drag and drop your photo here</p>
        <p className="upload-dropzone-sub">or browse from your device</p>
        <button type="button" className="btn btn-primary" disabled={disabled}>
          Choose photo
        </button>
        <p className="upload-dropzone-note">JPG or PNG · up to {maxUploadMb} MB</p>
      </div>

      <div className="demo-room-row">
        <p className="demo-room-label">Try a demo room</p>
        <div className="demo-room-options">
          {DEMO_ROOMS.map((room) => (
            <button
              key={room.id}
              type="button"
              className="demo-room-chip"
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
