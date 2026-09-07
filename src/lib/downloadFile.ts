/**
 * Put a file in front of the user.
 *
 * The object URL is revoked immediately after the click: the blob is already
 * captured by the download, and leaving it alive pins the whole file in memory
 * for the life of the tab - which for a 300-key handout kit is not small.
 */

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function downloadText(
    text: string,
    filename: string,
    mimeType: string = 'text/plain;charset=utf-8'
): void {
    downloadBlob(new Blob([text], { type: mimeType }), filename);
}
