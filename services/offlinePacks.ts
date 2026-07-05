// services/offlinePacks.ts
// Vector offline maps via Mapbox's native offlineManager (TileStore).
// Replaces the legacy raster-tile downloader (services/offlineTiles.ts):
// ~10× smaller downloads, labels at every zoom, and the map serves pack +
// ambient-cache tiles automatically when offline — no RasterSource swap.
import { offlineManager } from "@rnmapbox/maps";
import { deletePack as deleteLegacyRasterDir } from "./offlineTiles";
import type { OfflineBBox } from "@/store/offlineMapStore";

export const PACK_LIGHT = "navigo-region-light";
export const PACK_DARK  = "navigo-region-dark";

export const PACK_MIN_ZOOM = 10;
export const PACK_MAX_ZOOM = 16;

/** Mapbox mobile ceiling is 6 000 tiles per pack — guard with headroom. */
const MAX_TILES_PER_STYLE = 5500;

function lightStyleURL(): string {
  return process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? "mapbox://styles/mapbox/streets-v12";
}
const DARK_STYLE_URL = "mapbox://styles/mapbox/dark-v11";

// ── Size guard (same web-mercator math the raster estimator used) ────────────

function tilesInBBoxAtZoom(bbox: OfflineBBox, z: number): number {
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const n = Math.pow(2, z);
  const xOf = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const yOf = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const x1 = xOf(bbox.west), x2 = xOf(bbox.east);
  const y1 = yOf(bbox.north), y2 = yOf(bbox.south);
  return (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
}

export function estimateRegion(bbox: OfflineBBox): { tileCount: number; tooLarge: boolean } {
  let tiles = 0;
  for (let z = PACK_MIN_ZOOM; z <= PACK_MAX_ZOOM; z++) tiles += tilesInBBoxAtZoom(bbox, z);
  return { tileCount: tiles, tooLarge: tiles > MAX_TILES_PER_STYLE };
}

// ── Pack lifecycle ────────────────────────────────────────────────────────────

export interface RegionDownloadResult {
  bytes: number;
  tileCount: number;
}

/**
 * Download the region as two vector packs (light + dark styles) so offline
 * matches the app's theme. Progress is the average of both packs.
 * Rejects on the first pack error; safe to re-call (existing packs replaced).
 */
export async function downloadRegionPacks(
  bbox: OfflineBBox,
  onProgress: (fraction: number) => void,
): Promise<RegionDownloadResult> {
  await deleteRegionPacks(); // replace-in-place semantics

  const bounds: [GeoJSON.Position, GeoJSON.Position] = [
    [bbox.east, bbox.north], // NE
    [bbox.west, bbox.south], // SW
  ];

  let bytes = 0;
  let tiles = 0;
  const progresses: Record<string, number> = { [PACK_LIGHT]: 0, [PACK_DARK]: 0 };

  const downloadOne = (name: string, styleURL: string) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      offlineManager
        .createPack(
          {
            name,
            styleURL,
            bounds,
            minZoom: PACK_MIN_ZOOM,
            maxZoom: PACK_MAX_ZOOM,
            metadata: { createdAt: Date.now() },
          },
          (_pack, status) => {
            progresses[name] = (status.percentage ?? 0) / 100;
            onProgress((progresses[PACK_LIGHT] + progresses[PACK_DARK]) / 2);
            if (!settled && (status.percentage ?? 0) >= 100) {
              settled = true;
              bytes += status.completedResourceSize ?? 0;
              tiles += status.completedTileCount ?? 0;
              resolve();
            }
          },
          (_pack, err) => {
            if (!settled) {
              settled = true;
              reject(new Error(err?.message ?? "Offline pack download failed"));
            }
          },
        )
        .catch((e) => {
          if (!settled) {
            settled = true;
            reject(e);
          }
        });
    });

  // Sequential: keeps the progress bar honest and the network sane.
  await downloadOne(PACK_LIGHT, lightStyleURL());
  await downloadOne(PACK_DARK, DARK_STYLE_URL);

  return { bytes, tileCount: tiles };
}

export async function deleteRegionPacks(): Promise<void> {
  for (const name of [PACK_LIGHT, PACK_DARK]) {
    try {
      await offlineManager.deletePack(name);
    } catch {
      // pack didn't exist — fine
    }
  }
}

/**
 * One-time migration: remove the legacy raster tile directory from the old
 * downloader. Idempotent and safe to call on every offline-maps screen mount.
 */
export async function cleanupLegacyRasterTiles(): Promise<void> {
  try {
    await deleteLegacyRasterDir();
  } catch {
    // nothing to clean
  }
}
