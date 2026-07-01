import { useCallback, useEffect, useRef, useState } from "react";
import type { Point } from "../lib/api";

type Props = {
  imageUrl: string | null;
  points: Point[];
  onPointsChange: (points: Point[]) => void;
  disabled?: boolean;
};

const MAX_POINTS = 4;

export function PointSelector({ imageUrl, points, onPointsChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    if (points.length > 0) {
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
      ctx.lineWidth = Math.max(2, canvas.width / 400);

      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (points.length === MAX_POINTS) ctx.closePath();
      ctx.stroke();
      if (points.length === MAX_POINTS) ctx.fill();

      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(6, canvas.width / 120), 0, Math.PI * 2);
        ctx.fillStyle = i === points.length - 1 ? "#f97316" : "#2563eb";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(12, canvas.width / 80)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), p.x, p.y);
      });
    }
  }, [points]);

  useEffect(() => {
    if (!imageUrl) {
      imageRef.current = null;
      setImageSize({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl, draw]);

  useEffect(() => {
    draw();
  }, [draw, points]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || !imageUrl || points.length >= MAX_POINTS) return;

    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    onPointsChange([...points, { x: Math.round(x), y: Math.round(y) }]);
  };

  if (!imageUrl) {
    return (
      <div className="canvas-placeholder">
        Upload a kitchen photo to begin placing countertop corners.
      </div>
    );
  }

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="point-canvas"
        onClick={handleClick}
        style={{
          width: "100%",
          height: "auto",
          aspectRatio: imageSize.width && imageSize.height ? `${imageSize.width} / ${imageSize.height}` : undefined,
          cursor: disabled || points.length >= MAX_POINTS ? "default" : "crosshair",
        }}
      />
      <p className="hint">
        Click four corners in order (top-left → top-right → bottom-right → bottom-left).{" "}
        {points.length}/{MAX_POINTS} placed.
      </p>
    </div>
  );
}
