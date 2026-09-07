import QRCode from 'qrcode';
import { encodeGiftPayload } from './giftPayload';
import type { GiftCode } from './types';

/** Escape values interpolated into the printable QR sheet. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(data: string, size: number = 128): Promise<string> {
    try {
        const svg = await QRCode.toString(data, {
            type: 'svg',
            width: size,
            // margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return svg;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Generate multiple QR codes as SVG strings
 */
export async function generateMultipleQRCodes(
    dataArray: string[],
    size: number = 128
): Promise<string[]> {
    const promises = dataArray.map(data => generateQRCodeSVG(data, size));
    return Promise.all(promises);
}

/**
 * Create QR code grid HTML for printing
 */
export async function createQRCodeGridHTML(
    giftCodes: GiftCode[],
): Promise<string> {
    const qrCodes = await generateMultipleQRCodes(
        giftCodes.map(code => encodeGiftPayload(code))
    );

    // The batch ID is printed alongside the QR as well as encoded inside it, so
    // a card stays readable without a scanner.
    const cards = giftCodes.map((code, index) => {
        const batchLine = code.batchId
            ? `<div class="batch">Batch: ${escapeHtml(code.batchId)}</div>`
            : '';

        return `<span class="img">${qrCodes[index]}${batchLine}</span>
        `;
    }).join('');

    const gridHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Swarm BZZ Gift Code Dapp - QR Codes</title>
    <style>
        svg {width: 100%; height: auto;}
        .img {display:inline-block;width:20%; height:auto;margin:1%;vertical-align:top}
        .batch {font-family: monospace; font-size: 7px; word-break: break-all; text-align: center}
    </style>
</head>
<body>
    ${cards}
</body>
</html>`;

    return gridHTML;
}

/**
 * Open QR code grid in new window
 */
export function openQRCodeGrid(giftCodes: GiftCode[]): void {
    createQRCodeGridHTML(giftCodes).then(html => {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(html);
            newWindow.document.close();
        }
    }).catch(error => {
        console.error('Error opening QR code grid:', error);
        alert('Failed to generate QR code grid');
    });
}

/**
 * Download QR code grid as HTML file
 */
export function downloadQRCodeGrid(
    giftCodes: GiftCode[],
    filename: string = 'gift-codes.html'
): void {
    createQRCodeGridHTML(giftCodes).then(html => {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }).catch(error => {
        console.error('Error downloading QR code grid:', error);
        alert('Failed to download QR code grid');
    });
} 