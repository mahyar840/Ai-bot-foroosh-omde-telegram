// ---------------------------------------------------------------------------
// Overlays your logo (and optionally a text watermark with your phone number)
// onto a product photo. Uses @cf-wasm/photon, a WASM image library that
// actually runs inside Cloudflare Workers (Node libraries like `sharp` do NOT
// work here — Workers has no native/Node image support).
// ---------------------------------------------------------------------------
import { PhotonImage, watermark } from "@cf-wasm/photon";

export interface OverlayOptions {
  logoBytes: Uint8Array;     // your logo, e.g. loaded from an R2 bucket or bundled asset
  marginPx?: number;         // distance from the corner, default 24
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

export async function overlayLogo(
  sourceImageBytes: Uint8Array,
  opts: OverlayOptions
): Promise<Uint8Array> {
  const base = PhotonImage.new_from_byteslice(sourceImageBytes);
  const logo = PhotonImage.new_from_byteslice(opts.logoBytes);

  const margin = opts.marginPx ?? 24;
  const baseW = base.get_width();
  const baseH = base.get_height();
  const logoW = logo.get_width();
  const logoH = logo.get_height();

  let x = baseW - logoW - margin;
  let y = baseH - logoH - margin;
  if (opts.position === "bottom-left") x = margin;
  if (opts.position === "top-right") y = margin;
  if (opts.position === "top-left") { x = margin; y = margin; }

  watermark(base, logo, BigInt(Math.max(x, 0)), BigInt(Math.max(y, 0)));

  const outBytes = base.get_bytes_jpeg(90);

  base.free();
  logo.free();

  return outBytes;
}
