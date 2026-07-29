import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ConfigurationView } from "../ConfigurationView";
import type { ConfigurationState } from "../publicConfigApi";
import {
  buildDigitalEstimateFixtureState,
  installDigitalEstimateReviewFetchMock
} from "./digitalEstimateReviewFixtures";
import "../lovable-theme.css";
import "../styles.css";
import "@quote-lib/customerEstimate/customerEstimateDocument.css";
import "@quote-lib/customerEstimate/customerEstimateDocumentPrint.css";
import "../digitalEstimatePrint.css";

function DigitalEstimateReviewApp() {
  const [state, setState] = useState<ConfigurationState>(() => buildDigitalEstimateFixtureState());

  useEffect(() => {
    const restore = installDigitalEstimateReviewFetchMock();
    return restore;
  }, []);

  return (
    <div data-testid="de-review-harness" data-local-review="1">
      <div
        className="de-screen-only"
        style={{
          background: "#13241c",
          color: "#e8f0eb",
          fontSize: 12,
          padding: "6px 12px"
        }}
        data-testid="de-review-devbar"
      >
        Local Digital Estimate review harness — production ConfigurationView
      </div>
      <ConfigurationView
        state={state}
        onState={setState}
        onFatal={() => undefined}
        accessToken="local-review-token"
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DigitalEstimateReviewApp />
  </React.StrictMode>
);
