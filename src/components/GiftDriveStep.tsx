import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CONFIG } from '../config';
import { getGlobalRpcUrl } from './WalletBalanceCard';
import { parseGiftDriveList } from '../lib/giftDriveList';
import type { GiftDriveEntry } from '../lib/giftDriveList';
import { buildGiftCodeTable } from '../lib/giftCodeTable';
import { giftDrivesFileName } from '../lib/batchName';
import { downloadText } from '../lib/downloadFile';
import {
  createBatchesForWallets,
  formatBytes,
  formatBzz,
  formatTtl,
  getBatchCostPlur,
  getBatchTtlSeconds,
  getEffectiveCapacityBytes,
  preflightBatchWallets,
  readChainBatchLimits,
  summariseAffordability,
  validateBatchParams,
} from '../lib/postageBatch';
import type {
  BatchParams,
  BatchProgress,
  BatchResult,
  ChainBatchLimits,
  WalletAffordability,
} from '../lib/postageBatch';
import type { GiftCode } from '../lib/types';

const SETTINGS_STORAGE_KEY = 'swarm-bzz-gift-code-dapp:gift-drive-settings';

type Source = 'session' | 'paste';

interface GiftDriveSettings {
  depth: number;
  amount: string;
  encrypted: boolean;
  immutable: boolean;
}

interface GiftDriveStepProps {
  giftCodes: GiftCode[];
  batchName: string;
  onSessionDrivesCreated: (results: BatchResult[], params: BatchParams) => void;
}

function defaultSettings(): GiftDriveSettings {
  return {
    depth: CONFIG.DEFAULT_BATCH_DEPTH,
    amount: CONFIG.DEFAULT_BATCH_AMOUNT,
    encrypted: CONFIG.DEFAULT_BATCH_ENCRYPTED,
    immutable: CONFIG.DEFAULT_BATCH_IMMUTABLE,
  };
}

function loadSettings(): GiftDriveSettings {
  const defaults = defaultSettings();

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaults;

    const parsed = JSON.parse(stored) as Partial<GiftDriveSettings>;
    return {
      depth: typeof parsed.depth === 'number' ? parsed.depth : defaults.depth,
      amount: typeof parsed.amount === 'string' ? parsed.amount : defaults.amount,
      encrypted:
        typeof parsed.encrypted === 'boolean' ? parsed.encrypted : defaults.encrypted,
      immutable:
        typeof parsed.immutable === 'boolean' ? parsed.immutable : defaults.immutable,
    };
  } catch {
    return defaults;
  }
}

/** The per-chunk amount routinely exceeds Number.MAX_SAFE_INTEGER. */
function parseAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

export function GiftDriveStep({ giftCodes, batchName, onSessionDrivesCreated }: GiftDriveStepProps) {
  const [settings, setSettings] = useState<GiftDriveSettings>(loadSettings);
  const [source, setSource] = useState<Source>(giftCodes.length > 0 ? 'session' : 'paste');
  const [pasted, setPasted] = useState('');
  const [limits, setLimits] = useState<ChainBatchLimits | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [preflight, setPreflight] = useState<WalletAffordability[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isRunning = progress !== null;

  useEffect(() => {
    // Guarded to match loadSettings: setItem throws in Safari private mode and
    // wherever site data is blocked, and an unhandled throw in an effect takes
    // the step down over a saved preference.
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings just will not persist. Not worth interrupting the operator.
    }
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const provider = new ethers.JsonRpcProvider(getGlobalRpcUrl(), CONFIG.CHAIN_ID);

    (async () => {
      try {
        const read = await readChainBatchLimits(provider);
        if (cancelled) return;

        setLimits(read);

        // The contract's minimum tracks the storage price, so both the built-in
        // default and a value saved in an earlier session can fall below it.
        // Raise a stale value rather than leaving a form that can only fail.
        // Never lowers one the operator deliberately set higher.
        setSettings(prev => {
          const current = parseAmount(prev.amount);
          if (current !== null && current >= read.minimumInitialBalancePerChunk) return prev;
          return { ...prev, amount: read.minimumInitialBalancePerChunk.toString() };
        });
      } catch (err) {
        console.error('Failed to read postage batch limits:', err);
      }
    })();

    return () => {
      cancelled = true;
      // Otherwise every mount of the step leaves a polling provider behind.
      provider.destroy();
    };
  }, []);

  const amountPlur = useMemo(() => parseAmount(settings.amount), [settings.amount]);

  const params = useMemo<BatchParams | null>(() => {
    if (amountPlur === null) return null;
    return {
      depth: settings.depth,
      amountPerChunk: amountPlur,
      encrypted: settings.encrypted,
      immutable: settings.immutable,
    };
  }, [amountPlur, settings.depth, settings.encrypted, settings.immutable]);

  /**
   * The wallets this run will act on.
   *
   * Codes that already own a drive are excluded from both sources, not merely
   * carried through: re-running after a partial failure is the natural
   * recovery move, and without this it buys a second batch for every wallet
   * that already succeeded - paying twice and orphaning the first. The paste
   * path needs it most, since pasting the Copy export back is the documented
   * cross-session recovery and that export carries the batch IDs.
   *
   * Parsing can throw on a half-typed list, so the error is carried rather
   * than raised - the step still has to render.
   */
  const parsed = useMemo<{
    entries: GiftDriveEntry[];
    skipped: number;
    error: string | null;
  }>(() => {
    if (source === 'session') {
      const withoutDrive = giftCodes.filter(c => !c.batchId);
      return {
        entries: withoutDrive.map(c => ({ privateKey: c.privateKey })),
        skipped: giftCodes.length - withoutDrive.length,
        error: null,
      };
    }

    if (!pasted.trim()) return { entries: [], skipped: 0, error: null };

    try {
      const all = parseGiftDriveList(pasted);
      const withoutDrive = all.filter(e => !e.batchId);
      return {
        entries: withoutDrive,
        skipped: all.length - withoutDrive.length,
        error: null,
      };
    } catch (err) {
      return {
        entries: [],
        skipped: 0,
        error: err instanceof Error ? err.message : 'Could not read that list',
      };
    }
  }, [source, giftCodes, pasted]);

  const settingsErrors = params
    ? validateBatchParams(params, limits)
    : ['Amount must be a whole number of PLUR'];

  const readout = useMemo(() => {
    if (!params) return null;

    // Runs during render, before anything gates on settingsErrors, so it has
    // to tolerate whatever is currently in the depth field. getBatchCostPlur
    // does 2n ** BigInt(depth): a half-typed "17.5" would throw RangeError and
    // take the page down, and a huge depth would hang the tab on the
    // exponentiation. validateBatchParams reports why the readout is missing.
    if (
      !Number.isInteger(params.depth) ||
      params.depth < CONFIG.MIN_BATCH_DEPTH ||
      params.depth > CONFIG.MAX_BATCH_DEPTH
    ) {
      return null;
    }

    const costPlur = getBatchCostPlur(params.depth, params.amountPerChunk);
    return {
      costPlur,
      totalPlur: costPlur * BigInt(parsed.entries.length),
      capacityBytes: getEffectiveCapacityBytes(params.depth, params.encrypted),
      ttlSeconds: limits ? getBatchTtlSeconds(params.amountPerChunk, limits.lastPrice) : 0,
    };
  }, [params, limits, parsed.entries.length]);

  const canRun =
    !isRunning &&
    !isChecking &&
    parsed.entries.length > 0 &&
    parsed.error === null &&
    settingsErrors.length === 0;

  function updateSetting<K extends keyof GiftDriveSettings>(
    key: K,
    value: GiftDriveSettings[K]
  ) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setPreflight(null);
  }

  async function handleCheck() {
    if (!params) return;
    setError(null);
    setNotice(null);
    setIsChecking(true);

    try {
      const rows = await preflightBatchWallets(parsed.entries, params, getGlobalRpcUrl());
      setPreflight(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read wallet balances');
    } finally {
      setIsChecking(false);
    }
  }

  async function handleCreate() {
    if (!params) return;
    setError(null);
    setNotice(null);
    setResults(null);
    setProgress({ current: 0, total: parsed.entries.length, processing: 'checking balances' });

    try {
      const rpcUrl = getGlobalRpcUrl();

      // Re-read the limits: the price moves, and a stale minimum would only
      // show up as a revert part-way through a paid run.
      const provider = new ethers.JsonRpcProvider(rpcUrl, CONFIG.CHAIN_ID);
      let read: ChainBatchLimits;
      try {
        read = await readChainBatchLimits(provider);
      } finally {
        provider.destroy();
      }
      setLimits(read);

      const invalid = validateBatchParams(params, read);
      if (invalid.length > 0) {
        throw new Error(`Invalid gift drive settings: ${invalid.join('; ')}`);
      }

      const rows = await preflightBatchWallets(parsed.entries, params, rpcUrl);
      setPreflight(rows);

      const summary = summariseAffordability(rows);
      if (summary.affordable === 0) {
        throw new Error(
          `No wallet can pay for a gift drive. First problem: ${summary.firstReason}`
        );
      }

      const payable = rows.filter(row => row.canAfford);
      if (summary.blocked > 0) {
        setNotice(
          `Skipping ${summary.blocked} wallet${summary.blocked === 1 ? '' : 's'} that ` +
          `cannot pay. First problem: ${summary.firstReason}`
        );
      }

      setProgress({ current: 0, total: payable.length, processing: '' });

      const created = await createBatchesForWallets(
        payable.map(row => ({ privateKey: row.privateKey, address: row.address })),
        params,
        rpcUrl,
        setProgress
      );

      setResults(created);
      if (source === 'session') onSessionDrivesCreated(created, params);

      const ok = created.filter(r => r.batchId).length;
      const failed = created.length - ok;
      if (failed > 0) {
        setError(
          `${ok} gift drive${ok === 1 ? '' : 's'} created, ${failed} failed. ` +
          `See the list below.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create gift drives');
    } finally {
      setProgress(null);
    }
  }

  async function handleCopyResults() {
    if (!results) return;
    const text = buildGiftCodeTable(results);

    // Awaited, and failure is reported. For a pasted run these batch IDs live
    // nowhere but this component's state and the next run clears them, so
    // claiming a copy that did not happen loses paid-for drives.
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Gift drives copied to clipboard (private key, address, batch ID)');
    } catch {
      setError(
        'Could not write to the clipboard. Select the gift drives below and copy them ' +
        'manually - they are the only record of the batches just bought.'
      );
    }
  }

  function handleDownloadResults() {
    if (!results) return;

    // TSV, matching the copy button: the batch id is the point of this step,
    // and parseGiftDriveList reads this shape back into either paste box.
    downloadText(
      buildGiftCodeTable(results),
      giftDrivesFileName(batchName),
      'text/tab-separated-values;charset=utf-8',
    );
    setNotice(`Downloaded ${giftDrivesFileName(batchName)}`);
  }

  const preflightSummary = preflight ? summariseAffordability(preflight) : null;
  const createdCount = results ? results.filter(r => r.batchId).length : 0;

  return (
    <div className="space-y-4">
      <div className="font-semibold text-lg">Gift drives</div>
      <p className="text-sm text-muted-foreground">
        Attach Swarm storage to each gift code. Every wallet buys and owns its own
        postage batch, so the recipient's Bee node can stamp with it as soon as they
        import the key. Run this on codes from this session, or paste a list from an
        earlier one.
      </p>
      {source === 'session' && parsed.skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {parsed.skipped} of {giftCodes.length} already {parsed.skipped === 1 ? 'has' : 'have'} a
          gift drive and will be skipped, so none is paid for twice.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant={source === 'session' ? 'default' : 'secondary'}
          onClick={() => { setSource('session'); setPreflight(null); }}
          disabled={isRunning || giftCodes.length === 0}
        >
          Codes from this session{giftCodes.length > 0 ? ` (${giftCodes.length})` : ''}
        </Button>
        <Button
          type="button"
          variant={source === 'paste' ? 'default' : 'secondary'}
          onClick={() => { setSource('paste'); setPreflight(null); }}
          disabled={isRunning}
        >
          Paste a key list
        </Button>
      </div>

      {source === 'paste' && (
        <div className="space-y-2">
          <Label htmlFor="driveKeys">Gift codes (private keys)</Label>
          <Textarea
            id="driveKeys"
            value={pasted}
            onChange={e => { setPasted(e.target.value); setPreflight(null); }}
            placeholder="Enter private keys separated by commas or newlines"
            rows={8}
            disabled={isRunning}
          />
          {parsed.error && <p className="text-sm text-red-700">{parsed.error}</p>}
          {!parsed.error && (parsed.entries.length > 0 || parsed.skipped > 0) && (
            <p className="text-sm text-muted-foreground">
              {parsed.entries.length} key{parsed.entries.length === 1 ? '' : 's'} to stamp
              {parsed.skipped > 0
                ? `, ${parsed.skipped} skipped because they already have a gift drive`
                : ''}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="driveDepth">Depth</Label>
          <Input
            id="driveDepth"
            type="number"
            min={CONFIG.MIN_BATCH_DEPTH}
            max={CONFIG.MAX_BATCH_DEPTH}
            value={settings.depth}
            onChange={e => updateSetting('depth', Number(e.target.value))}
            disabled={isRunning}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="driveAmount">Amount per chunk (PLUR)</Label>
          <Input
            id="driveAmount"
            type="text"
            inputMode="numeric"
            value={settings.amount}
            onChange={e => updateSetting('amount', e.target.value)}
            disabled={isRunning}
          />
        </div>
      </div>

      {limits && (
        <p className="text-xs text-muted-foreground">
          Contract minimum is {limits.minimumInitialBalancePerChunk.toString()} PLUR
          (about 24 hours at the current price of {limits.lastPrice.toString()} PLUR per
          chunk per block).
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            id="driveEncrypted"
            type="checkbox"
            className="h-4 w-4"
            checked={settings.encrypted}
            onChange={e => updateSetting('encrypted', e.target.checked)}
            disabled={isRunning}
          />
          <Label htmlFor="driveEncrypted" className="font-normal">
            Size for encrypted uploads
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="driveImmutable"
            type="checkbox"
            className="h-4 w-4"
            checked={settings.immutable}
            onChange={e => updateSetting('immutable', e.target.checked)}
            disabled={isRunning}
          />
          <Label htmlFor="driveImmutable" className="font-normal">
            Immutable (rejects overwrites once full)
          </Label>
        </div>

        <p className="text-xs text-muted-foreground">Erasure coding: None (fixed)</p>
      </div>

      {readout && (
        <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium">Per gift drive</div>
          <div>Effective capacity: {formatBytes(readout.capacityBytes)}</div>
          <div>
            Estimated lifetime: {limits ? formatTtl(readout.ttlSeconds) : 'reading price...'}
          </div>
          <div>Cost: {formatBzz(readout.costPlur)} xBZZ</div>
          <div className="pt-1 font-medium">
            Total for {parsed.entries.length} wallet
            {parsed.entries.length === 1 ? '' : 's'}: {formatBzz(readout.totalPlur)} xBZZ
          </div>
        </div>
      )}

      {settingsErrors.length > 0 && (
        <Alert>
          <AlertTitle>Gift drive settings need attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {settingsErrors.map(message => <li key={message}>{message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={handleCheck} disabled={!canRun}>
          {isChecking ? 'Checking...' : 'Check wallets'}
        </Button>
        <Button type="button" className="flex-1" onClick={handleCreate} disabled={!canRun}>
          {isRunning
            ? 'Creating gift drives...'
            : `Create ${parsed.entries.length || ''} gift drive${parsed.entries.length === 1 ? '' : 's'}`}
        </Button>
      </div>

      {preflightSummary && !isRunning && (
        <Alert
          className={
            preflightSummary.blocked === 0
              ? 'border-green-500 bg-green-50 text-green-800'
              : 'border-amber-500 bg-amber-50 text-amber-900'
          }
        >
          <AlertTitle>
            {preflightSummary.affordable} of {preflight?.length} wallet
            {preflight?.length === 1 ? '' : 's'} can pay
          </AlertTitle>
          <AlertDescription>
            {preflightSummary.blocked === 0
              ? 'Every wallet holds enough xBZZ and has gas.'
              : `First problem: ${preflightSummary.firstReason}`}
          </AlertDescription>
        </Alert>
      )}

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Creating gift drive {progress.current} of {progress.total}</span>
            <span className="font-mono text-xs">{progress.processing}</span>
          </div>
          <div className="h-2 w-full rounded bg-slate-200">
            <div
              className="h-2 rounded bg-green-600 transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Two transactions per wallet (approve, then create). Leave this tab open.
          </p>
        </div>
      )}

      {notice && (
        <Alert className="border-blue-500 bg-blue-50 text-blue-800">
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert>
          <AlertTitle>Gift drives</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              {createdCount} gift drive{createdCount === 1 ? '' : 's'} created
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={handleCopyResults}>
                Copy gift drives
              </Button>
              <Button type="button" variant="secondary" onClick={handleDownloadResults}>
                Download gift drives
              </Button>
            </div>
          </div>
          <div className="divide-y rounded border border-slate-200">
            {/* Index in the key: a pasted list may repeat a wallet, since
                parseGiftDriveList deliberately does not deduplicate. */}
            {results.map((result, i) => (
              <div key={`${result.address}-${i}`} className="space-y-1 p-2 text-xs">
                <div className="font-mono">{result.address}</div>
                {result.batchId && (
                  <div className="break-all font-mono text-green-800">{result.batchId}</div>
                )}
                {result.error && <div className="text-red-700">{result.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
