/**
 * The bundled navigation models (Navigo's own, built from code in the
 * navigo-models repo). Kept apart from nav3d.ts so its logic stays testable.
 */
import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import type { VehicleModel } from "./nav3d";

export const MODEL_ASSETS: Record<VehicleModel, number> = {
  matatu: require("@/assets/models/matatu.glb"),
  bus: require("@/assets/models/bus.glb"),
  car: require("@/assets/models/car.glb"),
  boda: require("@/assets/models/boda.glb"),
  bicycle: require("@/assets/models/bicycle.glb"),
  train_sgr_loco: require("@/assets/models/train_sgr_loco.glb"),
  train_sgr_coach: require("@/assets/models/train_sgr_coach.glb"),
  train_commuter: require("@/assets/models/train_commuter.glb"),
  ferry: require("@/assets/models/ferry.glb"),
  plane: require("@/assets/models/plane.glb"),
  puck: require("@/assets/models/puck.glb"),
};

/**
 * Mapbox loads a model from a URL, and the bundled asset's own address
 * doesn't always work: Android cuts the query off a dev server URL, iOS keeps
 * it when the URL has no port (mapbox-maps-ios #2067), and an Android release
 * build gives a resource name Mapbox can't open. expo-asset copies each model
 * to a local file once; Mapbox gets a plain file:// URL on every platform and
 * build.
 */
const localUri = new Map<VehicleModel, Promise<string | null>>();

function resolveModel(model: VehicleModel): Promise<string | null> {
  let p = localUri.get(model);
  if (!p) {
    p = Asset.fromModule(MODEL_ASSETS[model])
      .downloadAsync()
      .then((a) => a.localUri ?? a.uri ?? null)
      .catch((e) => {
        localUri.delete(model); // try again next time
        if (__DEV__) console.warn(`[models] could not load ${model}`, e);
        return null;
      });
    localUri.set(model, p);
  }
  return p;
}

/** { modelId: file:// URL } for these models, once they're on disk (empty until then). */
export function useModelUris(models: VehicleModel[], ids?: Partial<Record<VehicleModel, string>>): Record<string, string> {
  const [uris, setUris] = useState<Record<string, string>>({});
  const key = models.join(",");
  useEffect(() => {
    let live = true;
    Promise.all(models.map(async (m) => [ids?.[m] ?? m, await resolveModel(m)] as const)).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, uri] of pairs) if (uri) next[id] = uri;
      setUris(next);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return uris;
}
