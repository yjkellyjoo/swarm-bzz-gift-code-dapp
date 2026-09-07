# 🎁 Swarm BZZ Gift Code Dapp

A React + TypeScript application for generating and managing [Swarm](https://www.ethswarm.org/) [BZZ](https://www.ethswarm.org/get-bzz) gift wallets on Gnosis Chain. Built with Vite, RainbowKit, and ethers.js.

## ✨ Features

### 🎁 Generate Codes Tab
- **Wallet Generation**: Create multiple new wallets with private keys
- **Custom RPC URL**: Input custom Gnosis RPC endpoint
- **Token Funding**: Fund wallets with xDAI and xBZZ tokens
- **Smart Contract Integration**: Uses the fund contract for efficient token distribution
- **Handout Kit Export**: Download QR images, a tracking spreadsheet and a printable card sheet as one zip
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

### Environment Variables
Create a `.env` file in the root directory:

```env
# Default RPC URL for Gnosis Chain
VITE_DEFAULT_RPC_URL=https://rpc.gnosischain.com

# Fund contract address
VITE_FUND_CONTRACT_ADDRESS=0xf268827Ef03CCCBEcf1d305b5B7DeD50D5ea4298

# Token addresses (update with actual addresses)
VITE_XDAI_TOKEN_ADDRESS=0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
VITE_XBZZ_TOKEN_ADDRESS=0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da
```

### Chain Configuration
The app is configured for **Gnosis Chain** (Chain ID: 100). Make sure your wallet is connected to the correct network.

## 📖 Usage Guide

### Generating Gift Codes

1. **Connect Wallet**: Click "Connect Wallet" and select your preferred wallet
2. **Switch Network**: Ensure you're connected to Gnosis Chain
3. **Configure Settings**:
   - Enter RPC URL (default provided)
   - Set xDAI amount per wallet
   - Set xBZZ amount per wallet
   - Choose number of wallets to generate
4. **Generate Codes**: Click "Generate Codes" to create new wallets
5. **Fund Wallets**: Use the fund contract to distribute tokens
6. **Export**: Copy the codes, or download the handout kit (see below)

### Downloading the Handout Kit

Turns a list of gift codes into everything an event handout needs. Runs entirely in
the browser — the private keys never leave the page.

1. **Choose a source**: the codes generated in this session, or paste a key list
2. **Name the batch**: this names both the spreadsheet and the PDF
3. **Download handout kit**: builds, verifies, then downloads a single `.zip`

The zip contains:

| File | What it is |
|------|------------|
| `qr/NN_0xAddress.png` | One QR per key. The payload is the bare private key, so a wallet scanning it imports the key directly. |
| `<name>.xlsx` | Tracking sheet: index, address, key, the QR embedded in its row, and a `Used` column. |
| `<name> - printable.pdf` | A4 sheets of cut-apart cards, 20 per page. |

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
├── components/          # Reusable UI components
│   ├── TabSwitcher.tsx
│   ├── WalletForm.tsx
│   ├── RecoveryForm.tsx
│   ├── QRCodeGrid.tsx
│   └── GiftKitExport.tsx
├── lib/                # Utility functions
│   ├── walletUtils.ts
│   ├── gnosisContract.ts
│   ├── tokenUtils.ts
│   ├── qrUtils.ts
│   └── giftKit/        # Handout kit: QR PNGs, xlsx, printable PDF, verification
├── pages/              # Main page components
│   ├── GenerateCodes.tsx
│   └── RecoverFunds.tsx
├── hooks/              # Custom React hooks
│   └── useWalletConnection.ts
└── config.ts           # Configuration constants
```

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

The app integrates with the fund contract at `0xf268827Ef03CCCBEcf1d305b5B7DeD50D5ea4298`:

```solidity
function fund(
  token: address,          // xBZZ token address
  tokenAmount: uint256,    // y × z
  nativeAmount: uint256,   // x × z
  addresses: address[]     // list of z wallet addresses
)
```

## 🔒 Security Features

- **Private Key Validation**: All private keys are validated before processing
- **Gas Estimation**: Automatic gas estimation for transactions
- **Error Handling**: Comprehensive error handling and user feedback
- **Transaction Safety**: Proper nonce management and transaction confirmation
- **Balance Checks**: Verify sufficient balance before funding operations

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
