import { useState, useEffect } from 'react';
import { generateQRCodeSVG } from '../lib/qrUtils';
import { encodeGiftPayload } from '../lib/giftPayload';
import type { GiftCode } from '../lib/types';

interface QRCodeGridProps {
  giftCodes: GiftCode[];
  title?: string;
  className?: string;
}

export function QRCodeGrid({ giftCodes, title = 'Gift Codes', className = '' }: QRCodeGridProps) {
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cancellation matters now that the payload depends on batchId: creating
    // gift drives replaces giftCodes mid-flight, and if the earlier run
    // resolved last the grid would show bare-key QRs under cards that display
    // a batch. Before, the payload was a pure function of the key and a stale
    // resolution was harmless.
    let cancelled = false;

    const generateQRCodes = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const codes = await Promise.all(
          giftCodes.map(code => generateQRCodeSVG(encodeGiftPayload(code)))
        );

        if (cancelled) return;
        setQrCodes(codes);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to generate QR codes');
        console.error('Error generating QR codes:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (giftCodes.length > 0) {
      generateQRCodes();
    } else {
      setQrCodes([]);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [giftCodes]);

  if (isLoading) {
    return (
      <div className={`qr-code-grid ${className}`}>
        <div className="loading">Generating QR codes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`qr-code-grid ${className}`}>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (giftCodes.length === 0) {
    return (
      <div className={`qr-code-grid ${className}`}>
        <div className="empty-state">No gift codes to display</div>
      </div>
    );
  }

  return (
    <div className={`qr-code-grid ${className}`}>
      <div className="grid-header">
        <h3>{title}</h3>
        <p>Generated {giftCodes.length} gift wallet{giftCodes.length !== 1 ? 's' : ''}</p>
      </div>
      
      <div className="codes-list">
        {giftCodes.map((code, index) => (
          <div key={index} className="code-item">
            <div className="code-header">
              <span className="code-number">#{index + 1}</span>
              <span className="wallet-address">{code.address}</span>
            </div>
            
            <div className="qr-code-container">
              {qrCodes[index] && (
                <div 
                  className="qr-code"
                  dangerouslySetInnerHTML={{ __html: qrCodes[index] }}
                />
              )}
            </div>
            
            <div className="code-details">
              <div className="private-key">
                <label>Private Key:</label>
                <code>{code.privateKey}</code>
              </div>
              
              {code.xdaiBalance !== undefined && (
                <div className="balance xdai">
                  <label>xDAI Balance:</label>
                  <span>{code.xdaiBalance}</span>
                </div>
              )}
              
              {code.xbzzBalance !== undefined && (
                <div className="balance xbzz">
                  <label>xBZZ Balance:</label>
                  <span>{code.xbzzBalance}</span>
                </div>
              )}
            </div>

            {code.batchId && (
              <div className="mt-2 rounded border border-green-500 bg-green-50 p-2 text-xs text-green-900">
                <div className="font-medium">Postage batch</div>
                <code className="break-all">{code.batchId}</code>
                <div className="mt-1 text-green-800">
                  depth {code.batchDepth}
                  {code.encrypted ? ' · sized for encrypted uploads' : ''}
                  {code.immutable ? ' · immutable' : ' · mutable'}
                  {' · erasure coding none'}
                </div>
              </div>
            )}

            {code.batchError && (
              <div className="mt-2 rounded border border-red-500 bg-red-50 p-2 text-xs text-red-800">
                <div className="font-medium">Postage batch failed</div>
                <div className="break-words">{code.batchError}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 