/**
 * Figma blend mode -> Photoshop blend mode.
 *
 * ISOMORPHIC. See types.ts for the constraint.
 *
 * Safe to map at all, because Figma renders a node in *isolation*: there is
 * nothing behind it to blend against, so the blend mode is NOT baked into the
 * returned pixels. This is precisely the opposite of opacity, which IS baked.
 * Getting one right and the other wrong is the most likely cause of a PSD that
 * looks *almost* correct. See PsdPlanRaster in types.ts.
 */

import type { BlendMode } from 'ag-psd'

export const FIGMA_TO_PSD_BLEND: Record<string, BlendMode> = {
  PASS_THROUGH: 'pass through', // groups only; meaningless on a leaf
  NORMAL: 'normal',
  DARKEN: 'darken',
  MULTIPLY: 'multiply',
  LINEAR_BURN: 'linear burn', // Figma's UI calls this "Plus darker". Same math.
  COLOR_BURN: 'color burn',
  LIGHTEN: 'lighten',
  SCREEN: 'screen',
  LINEAR_DODGE: 'linear dodge', // Figma's UI: "Plus lighter" = PS "Linear Dodge (Add)".
  COLOR_DODGE: 'color dodge',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft light', // see SOFT_LIGHT_DRIFTS below
  HARD_LIGHT: 'hard light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
}

/**
 * Figma/Skia implement the W3C `soft-light` formula; Photoshop uses its own
 * (the `Cb <= 0.25` branch differs). Visually close, not identical, and there
 * is nothing we can do about it — so warn once per export rather than silently
 * shipping a drifted composite.
 */
export const SOFT_LIGHT_DRIFTS = 'SOFT_LIGHT'

/**
 * Photoshop modes with no Figma source, never emitted: dissolve, darker color,
 * lighter color, vivid light, linear light, pin light, hard mix, subtract,
 * divide.
 */
export function mapBlend(figmaBlend: string | undefined, isGroup: boolean): BlendMode {
  const mapped = FIGMA_TO_PSD_BLEND[figmaBlend ?? 'NORMAL'] ?? 'normal'
  // Figma reports PASS_THROUGH inconsistently on leaves, where it has no meaning.
  if (mapped === 'pass through' && !isGroup) return 'normal'
  return mapped
}
