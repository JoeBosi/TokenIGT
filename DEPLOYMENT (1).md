# Deployment Documentation

## Current Deployments

### Amoy Testnet (Active) - v1.6.3-security-fixes

| Contract | Address | Version |
|----------|---------|---------|
| **Token Proxy** | `0x55F7DaBE49cc7947D6ac12014Af40305176581eB` | 1.6.3-security-fixes |
| **Implementation V1** | `0xeD7741db36Cf22e9D339A48e767313f33EFAb360` | 1.6.3-security-fixes |
| **Implementation V2** | Upgraded from V1 | v2 initialized |

**Explorer Links:**
- Proxy: https://amoy.polygonscan.com/address/0x55F7DaBE49cc7947D6ac12014Af40305176581eB

### Previous Deployment - v1.6.2-cleanup-final (Deprecated)

| Contract | Address | Version |
|----------|---------|---------|
| **Token Proxy** | `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab` | 1.6.2-cleanup-final |
| **Implementation V1** | `0xaf5c904Aab2dd9A30BF5a76b9913cBafdF218BFf` | 1.6.2-cleanup-final |

**Explorer Links:**
- Proxy: https://amoy.polygonscan.com/address/0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab

**Note:** v1.6.2 had security issues (EIP-3009/ERC-1363 bypassing PAUSE/BLOCK/FREEZE). Use v1.6.3.

### Token Details (Amoy)

- **Name:** IGE Token
- **Symbol:** IGT
- **Decimals:** 18
- **Initial Supply:** 10,000 IGT
- **Current Supply:** ~10,062 IGT (after minting)
- **Fee:** 10 basis points (0.1%)
- **Fee Collector:** `0x2D6eCb55771f262f99F9dF8163910B1968a7862F`

### Role Assignments (Amoy)

| Role | Address | Status |
|------|---------|--------|
| DEFAULT_ADMIN_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` | ✅ Active |
| UPGRADER_ROLE | `0x15CA765a1D8ce75a8B419F7A79bDe38e7AaD95E0` | ✅ Active |
| MINTER_ROLE | `0x5366053a98f10e8cded12af53aaa6afd33a14a5a` | ✅ Active |
| BURNER_ROLE | `0xfCb48aDbb480376089921b0A65B5022cB7EC3588` | ✅ Active |
| PAUSER_ROLE | `0x518322969492b8e52ca5d2eb1bc6c0d2f45d5892` | ✅ Active |
| FREEZER_ROLE | `0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1` | ✅ Active |
| BLOCKER_ROLE | `0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1` | ✅ Active |
| FEE_ADMIN_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` | ✅ Active |
| RECOVERER_ROLE | `0x2D6eCb55771f262f99F9dF8163910B1968a7862F` | ✅ Active |

### V2 Upgrade State

After V1 → V2 upgrade:
- `newVariable`: `42`
- `newString`: `"V2 Upgrade Test"`
- State preserved: ✅
- All V1 functionality maintained: ✅

## Deployment Files

All deployment artifacts are stored in:
- `deployments/amoy-fresh/proxy.json`
- `deployments/amoy-fresh/implementation.json`
- `deployments/amoy-fresh/roles.json`
- `deployments/amoy-fresh/test-results.json`

## ABI Files

Contract ABIs are available in:
- `abi/Token.json` - Main token ABI
- `abi/TokenV2.json` - V2 extended ABI
- `abi/TokenV3.json` - V3 extended ABI
- `abi/ERC1967Proxy.json` - Proxy ABI

## Network Configuration

### Amoy Testnet
- **Chain ID:** 80002
- **RPC URL:** https://rpc-amoy.polygon.technology
- **Currency:** POL
- **Block Explorer:** https://amoy.polygonscan.com

### Polygon Mainnet
- **Chain ID:** 137
- **RPC URL:** https://polygon-rpc.com
- **Currency:** POL
- **Block Explorer:** https://polygonscan.com
