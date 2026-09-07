import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '../lib/downloadFile';
import { parseGiftDriveList } from '../lib/giftDriveList';
import type { GiftDriveEntry } from '../lib/giftDriveList';
import type { BuildProgress, KitReport } from '../lib/giftKit';
import type { GiftCode } from '../lib/types';

const DEFAULT_NAME = 'Swarm BZZ Gift Codes';

type Source = 'session' | 'paste';

interface GiftKitExportProps {
  giftCodes: GiftCode[];
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
  // Parsing can throw on a half-typed list; the component must still render.
  // The message is kept rather than swallowed - the export button is disabled
  // when nothing parsed, so without showing why, a bad key would just grey the
  // button out with no explanation anywhere.
  const parsedPaste = useMemo<{ count: number; drives: number; error: string | null }>(() => {
    if (!pasted.trim()) return { count: 0, drives: 0, error: null };
    try {
      const entries = parseGiftDriveList(pasted);
      return {
        count: entries.length,
        drives: entries.filter(e => e.batchId).length,
        error: null,
      };
    } catch (err) {
      return {
        count: 0,
        drives: 0,
        error: err instanceof Error ? err.message : 'Could not read that list',
      };
    }
  }, [pasted]);

  const pastedCount = parsedPaste.count;
  const keyCount = source === 'session' ? giftCodes.length : pastedCount;
  // Counted for the pasted source too: confirming the drives were picked up is
  // the whole reason to paste the export rather than a plain key list.
  const driveCount =
    source === 'session' ? giftCodes.filter(c => c.batchId).length : parsedPaste.drives;

  async function handleExport() {
    setError(null);
    setReport(null);
    setProgress({ phase: 'build', done: 0, total: 1 });

    try {
      const entries: GiftDriveEntry[] =
        source === 'session'
          ? giftCodes.map(c => ({
              privateKey: c.privateKey,
              ...(c.batchId ? { batchId: c.batchId } : {}),
            }))
          : parseGiftDriveList(pasted);

      if (entries.length === 0) throw new Error('No gift codes to export');

      const keys = entries.map(e => e.privateKey);

      // Only the codes that actually have a gift drive; the rest keep a bare
      // key QR so a wallet can scan and import them directly.
      const driveByKey = new Map(
        entries
          .filter((e): e is GiftDriveEntry & { batchId: string } => Boolean(e.batchId))
          .map(e => [e.privateKey.toLowerCase(), e.batchId]),
      );

      // Imported here, never at module scope: this is what keeps exceljs,
      // pdf-lib, pdfjs-dist and zxing-wasm out of the main bundle.
      const { buildGiftKit } = await import('../lib/giftKit');

      const { zipBytes, report: built, name: usedName } = await buildGiftKit(
        keys,
        { name: name.trim() || DEFAULT_NAME, driveByKey },
        setProgress,
      );

      // usedName is the sanitised form, so the zip matches the files inside it.
      downloadBlob(
        new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' }),
        `${usedName}.zip`,
      );
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
      <p className="text-sm text-muted-foreground">
        A code with a gift drive gets a QR carrying both the key and the drive, and the
        drive is recorded in the sheet. A code without one keeps a plain key QR that any
        wallet can scan.
        {driveCount > 0
          ? ` ${driveCount} of ${keyCount} selected code${keyCount === 1 ? '' : 's'} ${driveCount === 1 ? 'has' : 'have'} a gift drive.`
          : ''}
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
          {parsedPaste.error && (
            <p className="text-sm text-red-700">{parsedPaste.error}</p>
          )}
          {!parsedPaste.error && pastedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {pastedCount} key{pastedCount === 1 ? '' : 's'} read. Paste the gift drive
              export to carry the drives through too.
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        onClick={handleExport}
        disabled={isRunning || keyCount === 0}
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
