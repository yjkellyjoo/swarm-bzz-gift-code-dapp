/** Below this, phone cameras start failing on print. */
export const MM_PER_MODULE_FLOOR = 0.6;

export function mmPerModule(qrMm: number, moduleCount: number): number {
  return qrMm / moduleCount;
}

export function assessScannability(v: number): { ok: boolean; message: string } {
  return v >= MM_PER_MODULE_FLOOR
    ? { ok: true, message: `${v.toFixed(2)} mm per module` }
    : {
        ok: false,
        message:
          `printed modules are ${v.toFixed(2)} mm - below ${MM_PER_MODULE_FLOOR} mm ` +
          'phone cameras start failing on print',
      };
}
