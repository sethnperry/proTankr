"use client";
// app/planner/components/PlanCompartmentsSection.tsx
//
// The trailer on the Plan page: the compartment bars, the compartment detail
// window (opened by tapping a bar) and the CG slider.

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import PlannerControls from "../sections/PlannerControls";
import CompartmentDetailModal from "./CompartmentDetailModal";
import CgSlider from "./CgSlider";
import { productColorFor } from "../utils/productColor";
import { styles } from "../ui/styles";
import type { usePlanMath } from "../hooks/usePlanMath";
import type { CompPlanInput, CompRow, ProductRow } from "../types";

type Math = ReturnType<typeof usePlanMath>;

type Props = {
  selectedTrailerId: string | null;
  compLoading: boolean;
  compError: string | null;
  compartments: CompRow[];
  persistedCapForComp: Math["persistedCapForComp"];
  effectiveMaxGallonsForComp: Math["effectiveMaxGallonsForComp"];
  plannedGallonsByComp: Math["plannedGallonsByComp"];
  compPlan: Record<number, CompPlanInput>;
  setCompPlan: Dispatch<SetStateAction<Record<number, CompPlanInput>>>;
  terminalProducts: ProductRow[];
  selectedComp: number | null;
  selectedTerminalId: string | number;
  isLandscape: boolean;
  cgSlider: number;
  setCgSlider: (v: number | ((prev: number) => number)) => void;
  hasCombo: boolean;
  /** Opens the product choice for a compartment. */
  onChangeProduct: (compNumber: number) => void;
};

export default function PlanCompartmentsSection({
  selectedTrailerId,
  compLoading,
  compError,
  compartments,
  persistedCapForComp,
  effectiveMaxGallonsForComp,
  plannedGallonsByComp,
  compPlan,
  setCompPlan,
  terminalProducts,
  selectedComp,
  selectedTerminalId,
  isLandscape,
  cgSlider,
  setCgSlider,
  hasCombo,
  onChangeProduct,
}: Props) {
  const [detailComp, setDetailComp] = useState<number | null>(null);

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <PlannerControls
          styles={styles}
          selectedTrailerId={selectedTrailerId}
          compLoading={compLoading}
          compartments={compartments}
          compError={compError}
          persistedCapForComp={persistedCapForComp}
          effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
          plannedGallonsByComp={plannedGallonsByComp}
          compPlan={compPlan}
          setCompPlan={setCompPlan}
          terminalProducts={terminalProducts}
          selectedComp={selectedComp}
          onSelectComp={(n: number) => setDetailComp(n)}
          selectedTerminalId={selectedTerminalId}
          isLandscape={isLandscape}
        />
      </div>

      {(() => {
        const n = detailComp;
        const c = n == null ? null : compartments.find((x) => Number(x.comp_number) === n);
        if (n == null || !c) return null;
        const trueMax = Number(c.max_gallons ?? 0);
        const persisted = persistedCapForComp(n);
        const sel = compPlan[n];
        const isEmpty = !!sel?.empty || !sel?.productId;
        const prod: any = !isEmpty ? terminalProducts.find((p) => p.product_id === sel?.productId) : null;
        const name = prod ? String(prod.display_name || prod.product_name || "Product") : "Empty";
        return (
          <CompartmentDetailModal
            open
            compNumber={n}
            trueMax={trueMax}
            persistedCap={persisted}
            capGallons={effectiveMaxGallonsForComp(n, persisted)}
            plannedGallons={Number(plannedGallonsByComp?.[n] ?? 0)}
            hasOverride={sel?.capOverride != null}
            productLabel={name}
            code={
              isEmpty
                ? "MT"
                : String(prod?.button_code ?? prod?.product_code ?? name.split(" ")[0])
                    .trim()
                    .toUpperCase()
            }
            color={(prod?.hex_code && String(prod.hex_code).trim()) || productColorFor(prod?.product_name ?? "")}
            isEmpty={isEmpty}
            onCapChange={(g) =>
              setCompPlan((prev: any) => ({ ...prev, [n]: { ...(prev[n] ?? { empty: false, productId: "" }), capOverride: g } }))
            }
            onResetCap={() =>
              setCompPlan((prev: any) => ({ ...prev, [n]: { ...(prev[n] ?? { empty: false, productId: "" }), capOverride: null } }))
            }
            onChangeProduct={() => {
              setDetailComp(null);
              onChangeProduct(n);
            }}
            onClose={() => setDetailComp(null)}
          />
        );
      })()}

      <CgSlider value={cgSlider} onChange={setCgSlider} disabled={!hasCombo} />
    </>
  );
}
