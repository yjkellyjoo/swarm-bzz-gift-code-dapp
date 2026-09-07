import { ethers } from 'ethers';
import { CONFIG, ERC20_ABI } from '../config';
import { decodeGiftPayload, isValidPrivateKey } from './giftPayload';

export { isValidPrivateKey };

export interface WalletInfo {
    address: string;
    privateKey: string;
    mnemonic?: string;
}

export interface GiftWallet {
    address: string;
    privateKey: string;
    xdaiBalance: string;
    xbzzBalance: string;
}

/**
 * Generate a new random wallet
 */
export function generateWallet(): WalletInfo {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase
    };
}

/**
 * Generate multiple wallets
 */
export function generateWallets(count: number): WalletInfo[] {
    if (count <= 0 || count > CONFIG.MAX_WALLETS_PER_GENERATION) {
        throw new Error(`Invalid wallet count. Must be between 1 and ${CONFIG.MAX_WALLETS_PER_GENERATION}`);
    }

    const wallets: WalletInfo[] = [];
    for (let i = 0; i < count; i++) {
        wallets.push(generateWallet());
    }
    return wallets;
}

/**
 * Import wallet from private key
 */
export function importWallet(privateKey: string): WalletInfo {
    try {
        const wallet = new ethers.Wallet(privateKey);
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    } catch (error) {
        throw new Error('Invalid private key');
    }
}

/**
 * Parse private keys from text input.
 *
 * Accepts bare keys separated by commas, tabs or newlines, and also the
 * structured payload a gift QR carries once the wallet has a postage batch.
 *
 * Structured payloads have to be handled per line rather than split on commas,
 * because the payload is JSON and contains commas of its own. Extracting the
 * key from it also matters for safety: a batch ID is a 32-byte hex string, so
 * a naive split would happily treat it as a second private key and try to
 * drain a wallet that does not exist.
 *
 * The header row emitted by the Copy Codes export is skipped, so exported
 * codes can be pasted straight back in.
 */
export function parsePrivateKeys(input: string): string[] {
    if (!input.trim()) {
        return [];
    }

    const validKeys: string[] = [];
    const invalidKeys: string[] = [];
    const seen = new Set<string>();

    const addToken = (token: string, label: string) => {
        const decoded = decodeGiftPayload(token);
        if (!decoded) {
            invalidKeys.push(`${label}: ${token.substring(0, 12)}...`);
            return;
        }

        // Guard against the same wallet being listed twice, which would
        // otherwise be drained twice.
        const dedupeKey = decoded.privateKey.toLowerCase();
        if (seen.has(dedupeKey)) return;

        seen.add(dedupeKey);
        validKeys.push(decoded.privateKey);
    };

    const lines = input.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    lines.forEach((line, lineIndex) => {
        // A structured payload is one whole line - do not split it.
        if (line.startsWith('{')) {
            addToken(line, `Line ${lineIndex + 1}`);
            return;
        }

        // Skip the Copy Codes export header.
        if (line.toLowerCase().startsWith('privatekey')) {
            return;
        }

        // Tab-delimited means a row from the Copy Codes export, whose columns
        // are privateKey/address/batchId. Only the first field is a key; the
        // others must not be mistaken for one.
        if (line.includes('\t')) {
            const [first] = line.split('\t');
            addToken(first.trim(), `Line ${lineIndex + 1}`);
            return;
        }

        line
            .split(',')
            .map(token => token.trim())
            .filter(token => token.length > 0)
            .forEach(token => addToken(token, `Line ${lineIndex + 1}`));
    });

    if (invalidKeys.length > 0) {
        throw new Error(`Invalid private keys found:\n${invalidKeys.join('\n')}`);
    }

    return validKeys;
}

/**
 * Get wallet from private key with provider
 */
export function getWalletWithProvider(privateKey: string, rpcUrl: string): ethers.Wallet {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return new ethers.Wallet(privateKey, provider);
}

/**
 * Get wallet balance in xDAI
 */
export async function getXDAIBalance(wallet: ethers.Wallet): Promise<string> {
    try {
        const balance = await wallet.provider?.getBalance(wallet.address);
        return ethers.formatEther(balance || 0);
    } catch (error) {
        console.error('Error getting xDAI balance:', error);
        return '0';
    }
}

/**
 * Get token balance
 */
export async function getTokenBalance(
    wallet: ethers.Wallet,
    tokenAddress: string
): Promise<string> {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const balance = await tokenContract.balanceOf(wallet.address);
        const decimals = await tokenContract.decimals();
        return ethers.formatUnits(balance, decimals);
    } catch (error) {
        console.error('Error getting token balance:', error);
        return '0';
    }
}

/**
 * Transfer all xDAI from wallet to destination
 */
export async function transferAllXDAI(
    wallet: ethers.Wallet,
    destinationAddress: string
): Promise<ethers.TransactionResponse> {
    const balance = await wallet.provider?.getBalance(wallet.address);
    if (!balance || balance === 0n) {
        throw new Error('No xDAI balance to transfer');
    }

    // Estimate gas for the transfer
    const gasEstimate = await wallet.provider?.estimateGas({
        from: wallet.address,
        to: destinationAddress,
        value: balance
    });

    const gasPrice = await wallet.provider?.getFeeData();

    // Calculate gas cost
    const gasCost = (gasEstimate || 21000n) * (gasPrice?.gasPrice || 20000000000n);

    // Transfer amount minus gas cost
    const transferAmount = balance - gasCost;

    if (transferAmount <= 0n) {
        throw new Error('Insufficient balance to cover gas costs');
    }

    return wallet.sendTransaction({
        to: destinationAddress,
        value: transferAmount,
        gasLimit: gasEstimate
    });
}

/**
 * Transfer all tokens from wallet to destination
 */
export async function transferAllTokens(
    wallet: ethers.Wallet,
    tokenAddress: string,
    destinationAddress: string
): Promise<ethers.TransactionResponse> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);

    if (balance === 0n) {
        throw new Error('No tokens to transfer');
    }

    return tokenContract.transfer(destinationAddress, balance);
}

/**
 * Get comprehensive wallet info including balances
 */
export async function getWalletInfo(
    privateKey: string,
    rpcUrl: string
): Promise<GiftWallet> {
    const wallet = getWalletWithProvider(privateKey, rpcUrl);

    const [xdaiBalance, xbzzBalance] = await Promise.all([
        getXDAIBalance(wallet),
        getTokenBalance(wallet, CONFIG.XBZZ_TOKEN_ADDRESS)
    ]);

    return {
        address: wallet.address,
        privateKey,
        xdaiBalance,
        xbzzBalance
    };
} 