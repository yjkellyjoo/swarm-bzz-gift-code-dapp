import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parsePrivateKeys } from '../lib/walletUtils';
import type { BuildProgress, KitReport } from '../lib/giftKit';
import type { GiftCode } from '../lib/types';

const DEFAULT_NAME = 'Swarm BZZ Gift Codes';

type Source = 'session' | 'paste';

interface GiftKitExportProps {
  giftCodes: GiftCode[];
}

function downloadZip(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function GiftKitExport({ giftCodes }: GiftKitExportProps) {
  const [name, setName] = useState(DEFAULT_NAME);
  const [source, setSource] = useState<Source>(giftCodes.length > 0 ? 'session' : 'paste');
  const touchedSource = useRef(false);
  const [pasted, setPasted] = useState('');
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<KitReport | null>(null);

  // This component mounts before any codes are generated, so the initial state
  // above always picks 'paste'. Switch to the session codes the moment they
  // appear -- unless the user has already chosen for themselves.
  useEffect(() => {
    if (!touchedSource.current && giftCodes.length > 0) setSource('session');
  }, [giftCodes.length]);

  function chooseSource(next: Source) {
    touchedSource.current = true;
    setSource(next);
  }

  const isRunning = progress !== null;
  const keyCount = source === 'session' ? giftCodes.length : 0;

  async function handleExport() {
    setError(null);
    setReport(null);
    setProgress({ phase: 'build', done: 0, total: 1 });

    try {
      const keys =
        source === 'session'
          ? giftCodes.map(c => c.privateKey)
          : parsePrivateKeys(pasted);

      if (keys.length === 0) throw new Error('No gift codes to export');

      // Imported here, never at module scope: this is what keeps exceljs,
      // pdf-lib, pdfjs-dist and zxing-wasm out of the main bundle.
      const { buildGiftKit } = await import('../lib/giftKit');

      const { zipBytes, report: built, name: usedName } = await buildGiftKit(
        keys,
        { name: name.trim() || DEFAULT_NAME },
        setProgress,
      );

      // usedName is the sanitised form, so the zip matches the files inside it.
      downloadZip(zipBytes, `${usedName}.zip`);
      setReport(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the handout kit');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="font-semibold text-lg">Handout kit</div>
      <p className="text-sm text-muted-foreground">
        QR images, a tracking sheet and a printable card sheet, as one zip. Every QR is
        decoded back out of all three before the download is offered.
      </p>

      <div className="space-y-2">
        <Label htmlFor="kitName">Batch name</Label>
        <Input
          id="kitName"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isRunning}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={source === 'session' ? 'default' : 'secondary'}
          onClick={() => chooseSource('session')}
          disabled={isRunning || giftCodes.length === 0}
        >
          Codes from this session{giftCodes.length > 0 ? ` (${giftCodes.length})` : ''}
        </Button>
        <Button
          type="button"
          variant={source === 'paste' ? 'default' : 'secondary'}
          onClick={() => chooseSource('paste')}
          disabled={isRunning}
        >
          Paste a key list
        </Button>
      </div>

      {source === 'paste' && (
        <div className="space-y-2">
          <Label htmlFor="kitKeys">Gift codes (private keys)</Label>
          <Textarea
            id="kitKeys"
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            placeholder="Enter private keys separated by commas or newlines"
            rows={8}
            disabled={isRunning}
          />
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        onClick={handleExport}
        disabled={isRunning || (source === 'session' && keyCount === 0)}
      >
        {isRunning ? 'Working...' : 'Download handout kit'}
      </Button>

      {progress && (
        <Alert>
          <AlertTitle>
            {progress.phase === 'build' ? 'Building' : 'Verifying'} {progress.done} of{' '}
            {progress.total}
          </AlertTitle>
          <AlertDescription>
            {progress.phase === 'build'
              ? 'Generating QR codes, the tracking sheet and the printable cards.'
              : 'Decoding every QR back out of the images, the sheet and the printed pages.'}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="border-red-500 bg-red-50 text-red-800">
          <AlertTitle>No kit was produced</AlertTitle>
          <AlertDescription>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      {report && (
        <Alert className="border-green-500 bg-green-50 text-green-800">
          <AlertTitle>
            Verified {report.count} code{report.count === 1 ? '' : 's'} across all three artifacts
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <div>
                {report.pages} printable page{report.pages === 1 ? '' : 's'}, 20 cards per page.
                Printed QR {report.qrMm.toFixed(1)} mm, {report.mmPerModule.toFixed(2)} mm per
                module. Card #N is the sheet row whose # column reads N.
              </div>
              <div>
                <div className="font-medium">
                  The Used column is ready to become checkboxes - one action on open:
                </div>
                <div>Google Sheets: select the column, Insert, Checkbox</div>
                <div>Numbers: select the column, Format, Cell, Data Format, Checkbox</div>
                <div>Excel 365: select the column, Insert, Checkbox</div>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
