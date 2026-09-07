import QRCode from 'qrcode';

/**
 * Generate QR code as SVG string, for the on-screen preview grid.
 *
 * The printable handout kit does not go through here: it needs raster PNGs it
 * can embed in a spreadsheet and a PDF, and decode back for verification. See
 * lib/giftKit.
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
