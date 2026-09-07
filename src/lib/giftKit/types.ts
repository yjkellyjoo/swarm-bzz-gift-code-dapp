/** One key in a batch, numbered from 1 so card #N is always sheet row N. */
export interface GiftKitItem {
  num: number;
  address: string;
  privateKey: string;
}

export interface QrArtifact {
  bytes: Uint8Array;
  moduleCount: number;
  pixelSize: number;
}

/** A decoded barcode reduced to what card ordering needs. */
export interface DecodedMark {
  text: string;
  cx: number;
  cy: number;
  height: number;
}

export interface VerificationProblem {
  where: string;
  detail: string;
}

export interface KitReport {
  count: number;
  pages: number;
  qrMm: number;
  moduleCount: number;
  mmPerModule: number;
}

export interface GiftKitOptions {
  name: string;
}
