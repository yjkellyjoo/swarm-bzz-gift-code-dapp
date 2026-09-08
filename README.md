# 🎁 Swarm BZZ Gift Code Dapp

A React + TypeScript application for generating and managing [Swarm](https://www.ethswarm.org/) [BZZ](https://www.ethswarm.org/get-bzz) gift wallets on Gnosis Chain. Built with Vite, RainbowKit, and ethers.js.

## ✨ Features

### 🎁 Generate Codes Tab

Three steps, run in order or independently. Each of the last two takes either the codes from this session or a key list you paste in, so you can come back to codes generated weeks ago.

**1. Generate gift codes**
- **Wallet Generation**: Create multiple new wallets with private keys
- **Custom RPC URL**: Input custom Gnosis RPC endpoint
- **Token Funding**: Fund wallets with xDAI and xBZZ tokens
- **Smart Contract Integration**: Uses the fund contract for efficient token distribution
- **Export**: Copy the codes, or download them as a `.txt` of one key per line

**1-1. Create gift drives** *(optional)*
- **Storage attached to a code**: Each wallet buys and owns a Swarm postage batch — its *gift drive* — so the recipient can upload as soon as they import the key
- **Operator settings**: Batch depth and amount per chunk, with live effective capacity, lifetime and xBZZ cost read from the contract
- **Preflight**: Every wallet's xBZZ and gas is checked before any transaction is sent
- **Export**: Copy or download key/address/batch ID as a `.tsv`

**2. Download the handout kit**
- **Handout Kit Export**: QR images, a tracking spreadsheet and a printable card sheet as one zip

<img width="922" height="600" alt="image" src="https://github.com/user-attachments/assets/b10305f5-dbfa-4688-b85c-88a2c378e6a4" />

### 💸 Recover Funds Tab

- **Bulk Recovery**: Recover funds from multiple gift wallets at once
- **Flexible Input**: Accept private keys separated by commas or newlines
- **Automatic Transfers**: Transfer all xDAI and xBZZ to connected wallet
- **Transaction Tracking**: View transaction hashes and block explorer links
- **Error Handling**: Comprehensive error reporting for failed recoveries
<img width="934" height="567" alt="image" src="https://github.com/user-attachments/assets/1e738a07-169f-41db-b750-168ce65aad10" />

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- pnpm (recommended) or npm
- MetaMask or other Web3 wallet

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/w3rkspacelabs/swarm-bzz-gift-code-dapp
   cd swarm-bzz-gift-code-dapp
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development server**
   ```bash
   pnpm dev
   ```

4. **Open in browser**
   ```
   http://localhost:5173
   ```

## 🔧 Configuration

### Constants

There are no environment variables and no `.env` file to create.
Every address and default lives in `src/config.ts`:

| Constant | Value |
|---|---|
| `FUND_CONTRACT_ADDRESS` | `0xf268827Ef03CCCBEcf1d305b5B7DeD50D5ea4298` |
| `POSTAGE_STAMP_ADDRESS` | `0x45a1502382541Cd610CC9068e88727426b696293` |
| `XDAI_TOKEN_ADDRESS` | `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` |
| `XBZZ_TOKEN_ADDRESS` | `0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da` |
| `DEFAULT_RPC_URL` | `https://rpc.gnosischain.com` |

The RPC URL is the one value you can change at runtime, from the input at the top of the page.

### Chain Configuration
The app is configured for **Gnosis Chain** (Chain ID: 100). Make sure your wallet is connected to the correct network.

## 📖 Usage Guide

### Generating Gift Codes

1. **Connect Wallet**: Click "Connect Wallet" and select your preferred wallet
2. **Switch Network**: Ensure you're connected to Gnosis Chain
3. **Configure Settings**:
   - Enter RPC URL (default provided)
   - Name the batch — this names every file the app writes
   - Set xDAI amount per wallet
   - Set xBZZ amount per wallet
   - Choose number of wallets to generate
4. **Generate Codes**: Click "Generate Codes" to create new wallets
5. **Fund Wallets**: Use the fund contract to distribute tokens
6. **Export**: Copy the codes, or **Download codes** for a `.txt` of one key per line

### The batch name

One input at the top of the form names all five files:

| File | Name |
|---|---|
| Gift codes download | `<name> - gift codes.txt` |
| Gift drives download | `<name> - gift drives.tsv` |
| Handout kit zip | `<name>.zip` |
| Tracking sheet | `<name>.xlsx` |
| Printable cards | `<name> - printable.pdf` |

Characters that break filenames or Excel sheet names (`* ? : \ / [ ]`) are replaced with `-`, so `ETHRome 2026: batch 1/2` becomes `ETHRome 2026- batch 1-2`.

### Creating Gift Drives

A *gift drive* is a Swarm postage batch owned by the gift wallet itself.
That ownership is the point: a Bee node can only sign stamps for batches its own key owns, so the recipient imports the gift key and can upload immediately, with no depth or amount decisions to make.

Run it on this session's codes, or paste a key list from an earlier one.

1. **Fund the wallets first** — each one pays for its own batch out of its own xBZZ
2. **Set depth and amount per chunk** — the readout shows effective capacity, estimated lifetime and cost in xBZZ, derived from the contract's live price
3. **Check wallets** — reads every wallet's xBZZ and gas before anything is spent, and reports which cannot pay
4. **Create gift drives** — two transactions per wallet: approve, then `createBatch`
5. **Export** — copy or download key/address/batch ID as a `.tsv`

Some things worth knowing:

- **Codes that already have a drive are skipped.** Re-running after a partial failure is the normal recovery move, and buying a second batch for a wallet that already has one would pay twice and orphan the first.
- **A failed wallet does not stop the run.** It is reported against its own code and the rest continue.
- **The contract's minimum amount tracks the storage price**, so a saved or default value can fall below it. The form reads the live minimum and raises a stale value rather than leaving settings that can only fail.
- **Erasure coding is fixed at none.** The encryption toggle only sizes the capacity estimate; it is not a batch property on-chain.

⚠️ **This spends real xBZZ on Gnosis mainnet.** There is no testnet path. Test with a single wallet at the minimum depth and amount before a real run.

### Downloading the Handout Kit

Turns a list of gift codes into everything an event handout needs. Runs entirely in
the browser — the private keys never leave the page.

1. **Choose a source**: the codes generated in this session, or paste a key list
2. **Download handout kit**: builds, verifies, then downloads a single `.zip`

Paste the gift drives export rather than a plain key list and the drives come through too.

The zip contains:

| File | What it is |
|------|------------|
| `qr/NN_0xAddress.png` | One QR per key. See the payload note below. |
| `<name>.xlsx` | Tracking sheet: index, address, key, the QR embedded in its row, a `Used` column, and a `Gift drive` column holding the batch ID. |
| `<name> - printable.pdf` | A4 sheets of cut-apart cards, 20 per page. |

**The QR payload depends on whether the code has a gift drive.**

Without one it is the bare private key, byte for byte, so a wallet scanning the card imports it directly.
With one it is compact JSON carrying both, because the batch ID has to travel with the key:

```json
{"v":1,"pk":"0x…","batch":"0x…"}
```

Nothing else goes in the QR.
Depth, encryption and immutability live in the spreadsheet instead — at 20 cards to an A4 page they would cost two QR versions, which is the difference between a card that scans off print and one that does not.

Every QR is decoded back out of all three artifacts before the download is offered.
If anything mismatches, no kit is produced and the error says what failed.

**Two things worth knowing:**

- **Cards never show the private key as text** — only the index, the QR, and a
  truncated address, so a stack of cards on a table is not readable over someone's
  shoulder. The truncated address is what maps a card back to a row in the sheet.
- **Card `#N` is the sheet row whose `#` column reads `N`.** Numbering always starts
  at 1.

**Turning the `Used` column into checkboxes** is one action when you open the sheet.
The file carries boolean values and the app supplies the widget:

- Google Sheets: select the column → Insert → Checkbox
- Numbers: select the column → Format → Cell → Data Format → Checkbox
- Excel 365: select the column → Insert → Checkbox

### Recovering Funds

1. **Connect Wallet**: Ensure your wallet is connected to Gnosis Chain
2. **Input Private Keys**: Paste gift codes (private keys) in the textarea
3. **Recover Funds**: Click "Recover Funds" to transfer all tokens
4. **Monitor Progress**: View transaction status and results
5. **Check Results**: Review recovered amounts and transaction hashes

## 🏗️ Architecture

### Project Structure
```
src/
├── components/
│   ├── GiftDriveStep.tsx    # Step 1-1: buy a postage batch per wallet
│   ├── GiftKitExport.tsx    # Step 2: build and verify the handout kit
│   ├── QRCodeGrid.tsx       # On-screen preview of the generated codes
│   ├── WalletBalanceCard.tsx
│   └── ui/                  # shadcn/ui primitives
├── lib/
│   ├── types.ts             # GiftCode and the generate form's shape
│   ├── walletUtils.ts       # Wallet generation, key parsing
│   ├── giftDriveList.ts     # The one parser for every pasted list shape
│   ├── giftPayload.ts       # What a gift QR carries, encode and decode
│   ├── giftCodeTable.ts     # The one place export text is built
│   ├── batchName.ts         # The batch name and the filenames from it
│   ├── downloadFile.ts      # One download implementation
│   ├── postageBatch.ts      # Gift drives: createBatch, cost, capacity, TTL
│   ├── gnosisContract.ts    # Fund contract, allowances
│   ├── blockchainUtils.ts   # Balances, transfers, fund recovery
│   ├── qrUtils.ts           # SVG QR for the on-screen preview
│   └── giftKit/             # Handout kit: QR PNGs, xlsx, printable PDF, verification
├── pages/
│   ├── GenerateCodes.tsx    # Hosts all three steps
│   └── RecoverFunds.tsx
├── hooks/
│   └── useWalletConnection.ts
└── config.ts                # Addresses, ABIs, defaults, capacity table
```

Tests live beside the code they cover as `*.test.ts`.

### Key Technologies

- **React 19**: Modern React with hooks and functional components
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **RainbowKit**: Wallet connection and UI components
- **wagmi**: React hooks for Ethereum
- **ethers.js**: Ethereum library for wallet operations
- **QRCode**: QR code generation
- **ExcelJS / pdf-lib / fflate**: Spreadsheet, PDF and zip generation in the browser
- **zxing-wasm / pdfjs-dist**: Decoding every QR back out to verify the kit
- **Vitest**: Unit and integration tests (`pnpm test`)

### Smart Contract Integration

**Funding** goes through the fund contract at `0xf268827Ef03CCCBEcf1d305b5B7DeD50D5ea4298`, called once for the whole batch by the connected wallet:

```solidity
function fund(
  token: address,          // xBZZ token address
  tokenAmount: uint256,    // y × z
  nativeAmount: uint256,   // x × z
  addresses: address[]     // list of z wallet addresses
)
```

**Gift drives** go through Swarm's PostageStamp contract at `0x45a1502382541Cd610CC9068e88727426b696293`, called by each gift wallet for itself:

```solidity
function createBatch(
  address _owner,                    // the gift wallet - this is what makes the batch usable
  uint256 _initialBalancePerChunk,   // amount per chunk, in PLUR
  uint8   _depth,                    // at least 17
  uint8   _bucketDepth,              // fixed at 16, as Bee requires
  bytes32 _nonce,
  bool    _immutable
)
```

The xBZZ is pulled from `msg.sender`, so each wallet approves the contract first — two transactions per gift drive.
The batch ID is read from the `BatchCreated` event.

## 🔒 Security Features

- **Keys never leave the browser**: Generation, stamping and every export happen in the page. Nothing is sent off-origin and no key is logged.
- **Private Key Validation**: All private keys are validated before processing
- **Gas Estimation**: Automatic gas estimation for transactions
- **Error Handling**: Comprehensive error handling and user feedback
- **Transaction Safety**: Proper nonce management and transaction confirmation
- **Balance Checks**: Verify sufficient balance before funding operations
- **Keys are never printed as text on a card**: They travel only inside the QR, so a stack of cards is not readable over someone's shoulder

**Where the keys end up.** The copy buttons put keys on the clipboard and the download buttons write them to your Downloads folder.
Both are intended, but a file persists in a way a clipboard does not — and once gift drives exist, those exports are the only record of batches bought with real xBZZ.
Losing the keys makes the batches unreachable.

**One caveat on batch IDs.** A batch ID is 32 bytes of hex, which is also a valid private key, so nothing can tell them apart by validation alone.
Column position is what keeps them straight: exports put the key first and the batch ID third, and the parser recognises that layout by the address in between.

## 🎨 UI/UX Features

- **Modern Design**: Clean, responsive interface with gradient backgrounds
- **Tab Navigation**: Intuitive tab-based navigation
- **Loading States**: Clear loading indicators for async operations
- **Error Messages**: User-friendly error messages and validation
- **Success Feedback**: Confirmation messages and transaction details
- **Mobile Responsive**: Optimized for desktop and mobile devices

## 🧪 Development

### Available Scripts

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linting
pnpm lint

# Run tests
pnpm test
```

### Code Quality

- **ESLint**: Code linting and formatting
- **TypeScript**: Strict type checking
- **Vitest**: Tests live beside the code as `*.test.ts` and are type-checked by `pnpm build`
- **Prettier**: Code formatting (if configured)

## 🤝 Contributing

1. Fork [w3rkspacelabs/swarm-bzz-gift-code-dapp](https://github.com/w3rkspacelabs/swarm-bzz-gift-code-dapp)
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## ⚠️ Disclaimer

This application deals with private keys and cryptocurrency transactions. Users are responsible for:

- Securing their private keys
- Verifying transaction details
- Understanding the risks of cryptocurrency operations
- Ensuring proper network connectivity

Always test with small amounts before using with significant funds.

## 🆘 Support

For issues and questions:

1. Check the [existing issues](https://github.com/w3rkspacelabs/swarm-bzz-gift-code-dapp/issues)
2. [Create a new issue](https://github.com/w3rkspacelabs/swarm-bzz-gift-code-dapp/issues/new) with detailed information
3. Include browser console logs for errors
4. Specify your wallet and network configuration

---

**Built with ❤️ for the [Swarm ecosystem](https://www.ethswarm.org/)**
