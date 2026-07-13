import type { Elite100VisualizerTexture } from "../lib/elite100VisualizerTextures";

type VisualizerFavoritesProps = {
  favorites: Elite100VisualizerTexture[];
  maxFavorites: number;
  activeSlug: string;
  onToggleFavorite: (slug: string) => void;
  onApplyFavorite: (slug: string) => void;
  canApply: boolean;
  hint?: string;
};

export function VisualizerFavorites({
  favorites,
  maxFavorites,
  activeSlug,
  onToggleFavorite,
  onApplyFavorite,
  canApply,
  hint,
}: VisualizerFavoritesProps) {
  const hintText =
    hint ??
    `Shortlist up to ${maxFavorites} Elite 100 colors for quick switching during a presentation.`;
  return (
    <section className="pv-panel pv-panel-favorites">
      <div className="pv-panel-title-row">
        <h3 className="pv-panel-title">Favorites</h3>
        <span className="pv-fav-count">{favorites.length}/{maxFavorites}</span>
      </div>
      <p className="pv-panel-hint">{hintText}</p>
      {favorites.length === 0 ? (
        <p className="pv-panel-hint pv-fav-empty">
          Tap the heart on any color below to add it here.
        </p>
      ) : (
        <div className="pv-fav-strip" role="list" aria-label="Favorite colors">
          {favorites.map((texture) => (
            <div key={texture.slug} className="pv-fav-item" role="listitem">
              <button
                type="button"
                className={`pv-fav-apply${activeSlug === texture.slug ? " active" : ""}`}
                disabled={!canApply || !texture.hasImage}
                onClick={() => onApplyFavorite(texture.slug)}
                title={`Apply ${texture.colorName}`}
              >
                {texture.thumbUrl ? (
                  <img src={texture.thumbUrl} alt="" loading="lazy" />
                ) : (
                  <span className="pv-texture-fallback">{texture.colorName.slice(0, 2)}</span>
                )}
                <span className="pv-fav-name">{texture.colorName}</span>
              </button>
              <button
                type="button"
                className="pv-fav-remove"
                aria-label={`Remove ${texture.colorName} from favorites`}
                onClick={() => onToggleFavorite(texture.slug)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function FavoriteToggleButton({
  isFavorite,
  disabled,
  onClick,
  colorName,
}: {
  isFavorite: boolean;
  disabled?: boolean;
  onClick: () => void;
  colorName: string;
}) {
  return (
    <button
      type="button"
      className={`pv-fav-toggle${isFavorite ? " active" : ""}`}
      disabled={disabled}
      aria-label={isFavorite ? `Remove ${colorName} from favorites` : `Add ${colorName} to favorites`}
      aria-pressed={isFavorite}
      onClick={onClick}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      {isFavorite ? "♥" : "♡"}
    </button>
  );
}
