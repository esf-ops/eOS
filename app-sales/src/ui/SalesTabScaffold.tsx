import React from "react";

type Props = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

/** Placeholder shell for Sales Head tabs not yet fully built in this slice. */
export default function SalesTabScaffold({ title, description, children }: Props) {
  return (
    <section className="scc-tab-scaffold" aria-labelledby="tab-scaffold-title">
      <h2 id="tab-scaffold-title" className="scc-tab-scaffold-title">
        {title}
      </h2>
      <p className="scc-tab-scaffold-desc">{description}</p>
      {children}
    </section>
  );
}
