/**
 * Put a file in front of the user.
 *
 * The object URL is revoked on a delay rather than right after the click:
 * some browsers resolve the blob URL asynchronously, so revoking it the
 * moment click() returns can yield a silent no-op or a 0-byte file while the
 * UI still reports success. A 60 second delay gives the download time to
 * actually start before the blob is freed, while still not pinning the whole
 * file in memory for the life of the tab.
 */

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(
    text: string,
    filename: string,
    mimeType: string = 'text/plain;charset=utf-8'
): void {
    downloadBlob(new Blob([text], { type: mimeType }), filename);
}
