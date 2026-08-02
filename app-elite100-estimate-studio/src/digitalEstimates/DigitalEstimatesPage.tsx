import React from "react";
import LiveDigitalEstimatesPage, {
  type LiveDigitalEstimatesPageProps
} from "../estimateQueue/LiveDigitalEstimatesPage";

export type DigitalEstimatesPageProps = Omit<
  LiveDigitalEstimatesPageProps,
  "onOpenLegacyPublishSearch" | "readOnlyHead"
>;

/**
 * Digital Estimates Head Slice 1.
 *
 * Temporarily rendered by the Elite 100 shell, but intentionally exposes only
 * read visibility and safe open/copy navigation. Publication mutations remain
 * outside this head slice.
 */
export default function DigitalEstimatesPage(props: DigitalEstimatesPageProps) {
  return (
    <section data-testid="digital-estimates-head">
      <LiveDigitalEstimatesPage {...props} readOnlyHead />
    </section>
  );
}
