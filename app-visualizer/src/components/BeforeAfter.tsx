type Props = {
  beforeUrl: string;
  afterUrl: string;
};

export function BeforeAfter({ beforeUrl, afterUrl }: Props) {
  return (
    <div className="compare-grid">
      <figure>
        <figcaption>Before</figcaption>
        <img src={beforeUrl} alt="Kitchen before visualization" />
      </figure>
      <figure>
        <figcaption>After</figcaption>
        <img src={afterUrl} alt="Kitchen after countertop visualization" />
      </figure>
    </div>
  );
}
