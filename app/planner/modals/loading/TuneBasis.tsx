"use client";
// app/planner/modals/loading/TuneBasis.tsx
//
// Plan Review: the Load basis panel. Load report: the read-only basis rows.

import { TunePanel } from "./TunePanel";
import { ReportBasisRows } from "./ReportBasisRows";
import type { LoadingModel } from "./useLoadingModel";

export function TuneBasis({ m }: { m: LoadingModel }) {
  const {
    ambientTempF,
    locationLabel,
    onTuneProduct,
    productHexCodeById,
    productNameById,
    report,
    reportBasisRows,
    tuneRows,
    tuneTempColor,
  } = m;
  return (
    <>
      {/* Load basis / Tune panel (review mode: interactive card, tap to
            correct) vs. Load Report's own plain read-only rows. */}
      {report ? (
        <ReportBasisRows rows={reportBasisRows} productNameById={productNameById} productHexCodeById={productHexCodeById} />
      ) : (
        tuneRows &&
        onTuneProduct &&
        tuneRows.length > 0 && (
          <TunePanel
            rows={tuneRows}
            tempColor={tuneTempColor || "#ffffff"}
            onTune={onTuneProduct}
            ambientTempF={ambientTempF}
            cityLabel={locationLabel ? locationLabel.split(",")[0] : null}
          />
        )
      )}
    </>
  );
}
