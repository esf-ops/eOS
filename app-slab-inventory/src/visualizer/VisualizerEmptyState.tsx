import type { DragEvent, ChangeEvent } from "react";
import { useRef } from "react";
import { VisualizerSampleGallery } from "./VisualizerSampleGallery";
import { VISUALIZER_SAMPLES } from "./samples";
import type { VisualizerSample } from "./types";

type VisualizerEmptyStateProps = {
  dragOver: boolean;
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onUploadClick: () => void;
  onFileSelect: (file: File) => void;
  onSelectSample: (sample: VisualizerSample) => void;
};

export function VisualizerEmptyState({
  dragOver,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadClick,
  onFileSelect,
  onSelectSample,
}: VisualizerEmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="pv-empty-showroom">
      <div
        className={`pv-dropzone pv-dropzone-premium${dragOver ? " drag-over" : ""}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />
        <div className="pv-dropzone-hero">
          <p className="pv-eyebrow">Elite Stone Visualizer</p>
          <h3 className="pv-dropzone-title">Preview Elite 100 colors in a real kitchen</h3>
          <p className="pv-dropzone-sub">
            Upload a kitchen photo or start from a sample space. Mark your countertop surfaces and
            explore stone options — entirely in your browser.
          </p>
          <div className="pv-dropzone-actions">
            <button type="button" className="btn primary" onClick={onUploadClick}>
              Upload photo
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </button>
          </div>
          <p className="pv-dropzone-note">
            Nothing leaves your device. Processing stays local.
          </p>
        </div>
      </div>

      <VisualizerSampleGallery
        samples={VISUALIZER_SAMPLES}
        onSelectSample={onSelectSample}
      />
    </div>
  );
}
