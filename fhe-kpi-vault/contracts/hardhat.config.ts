import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@fhevm/hardhat-plugin";
import * as dotenv from "dotenv";
import * as path from "path";

const envPath = path.resolve(__dirname, ".env");
dotenv.config({ path: envPath });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
const PRIVATE_KEY_RAW = (process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
const PRIVATE_KEY = PRIVATE_KEY_RAW ? (PRIVATE_KEY_RAW.startsWith("0x") ? PRIVATE_KEY_RAW : `0x${PRIVATE_KEY_RAW}`) : "";
const MNEMONIC = process.env.MNEMONIC || DEFAULT_MNEMONIC;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    fhevm: "./fhevmTemp"
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 500 },
      evmVersion: "cancun"
    }
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC
      },
      chainId: 31337,
      fhevm: {
        // Official Zama FHEVM Sepolia addresses (updated Nov 2025)
        aclContractAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D", // ACL_CONTRACT
        inputVerifierContractAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0", // INPUT_VERIFIER_CONTRACT
        kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A", // KMS_VERIFIER_CONTRACT
        verifyingContractAddressDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478", // DECRYPTION_ADDRESS
        verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955", // INPUT_VERIFICATION_ADDRESS
        gatewayChainId: 10901
      }
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : { mnemonic: MNEMONIC },
      chainId: 11155111,
      fhevm: {
        relayerUrl: "https://relayer.testnet.zama.org",
        // Official Zama FHEVM Sepolia addresses (updated Nov 2025)
        aclContractAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D", // ACL_CONTRACT
        inputVerifierContractAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0", // INPUT_VERIFIER_CONTRACT
        kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A", // KMS_VERIFIER_CONTRACT
        verifyingContractAddressDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478", // DECRYPTION_ADDRESS
        verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955", // INPUT_VERIFICATION_ADDRESS
        gatewayChainId: 10901
      }
    }
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6"
  },
  mocha: {
    timeout: 600000
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io"
        }
      }
    ]
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://sourcify.dev"
  }
};

export default config;
