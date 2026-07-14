import { parseEmlUpload } from "./emlInboundAdapter.mjs";
import { parseManualPaste } from "./pasteInboundAdapter.mjs";

/**
 * InboundEmailAdapter — lab-local only.
 * Future Outlook pollMailbox must throw / remain unimplemented until Phase 9.
 */
export class InboundEmailAdapter {
  /**
   * @param {{ kind: "eml_upload", bytes: Uint8Array, filename: string, importActor?: string }
   *   | { kind: "manual_paste", input: import("./inboundTypes.mjs").ManualEmailInput, importActor?: string }} source
   */
  async ingest(source) {
    if (source?.kind === "eml_upload") {
      return parseEmlUpload({
        bytes: source.bytes,
        filename: source.filename,
        importActor: source.importActor
      });
    }
    if (source?.kind === "manual_paste") {
      return parseManualPaste(source.input, { importActor: source.importActor });
    }
    throw Object.assign(new Error(`Unsupported ingest source: ${source?.kind}`), {
      code: "QIL_UNSUPPORTED"
    });
  }

  async pollMailbox() {
    throw Object.assign(new Error("Outlook / Graph mailbox polling is not available in Phase 2."), {
      code: "QIL_UNSUPPORTED"
    });
  }
}

export const inboundEmailAdapter = new InboundEmailAdapter();
