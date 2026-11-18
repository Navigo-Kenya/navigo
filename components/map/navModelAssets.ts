/**
 * The bundled navigation models (Navigo's own, built from code in the
 * navigo-models repo). Kept apart from nav3d.ts so its logic stays testable.
 */
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
