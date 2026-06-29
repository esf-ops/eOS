import CustomerEstimateDocument from "@quote-lib/customerEstimate/CustomerEstimateDocument";
import type { CustomerEstimateDocumentProps } from "@quote-lib/customerEstimate/documentProps";
import type {
  CustomerLineItem,
  CustomerRoomAddonLine
} from "@quote-lib/customerEstimate/documentProps";

export type CustomerEstimatePrintProps = CustomerEstimateDocumentProps;

export type { CustomerLineItem, CustomerRoomAddonLine };

/** Browser print wrapper around the shared customer estimate document renderer. */
export default function CustomerEstimatePrint(props: CustomerEstimatePrintProps) {
  return <CustomerEstimateDocument {...props} />;
}
