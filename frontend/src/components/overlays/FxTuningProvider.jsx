import { createContext, useContext } from "react";

/* ---------------------------------------------------------------------------
   FxTuningProvider — per-effect tuning, keyed by effect id.

   The values live on the profile (`profile.fx_tuning`), so they save with
   everything else, and the editor hands them down here for the preview to read.

   Nothing consumes them yet, on purpose: no effect in constants/effects.js
   declares a tunable parameter (the catalogs carry only id/label/premium), and
   inventing sliders for values the renderer ignores would be fake UI. This is
   the plumbing the editor already calls into, kept so that adding a parameter to
   an effect needs no rewiring.
   --------------------------------------------------------------------------- */

const FxTuningCtx = createContext({});

export function FxTuningProvider({ tuning = {}, children }) {
  return <FxTuningCtx.Provider value={tuning}>{children}</FxTuningCtx.Provider>;
}

/** Tuning values for one effect id, or an empty object when it has none. */
export function useFxTuning(effectId) {
  const tuning = useContext(FxTuningCtx);
  if (!effectId) return {};
  return tuning?.[effectId] || {};
}

export default FxTuningProvider;
