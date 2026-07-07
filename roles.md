# Roles & Methods Matrix — Token v2.0.0

Legenda:
- **✅** = può chiamare il metodo (richiede il ruolo)
- **👁️** = metodo pubblico/view, chiamabile da chiunque (nessun ruolo richiesto)
- **🔑** = richiede firma valida EIP-712 del titolare dei token, nessun ruolo on-chain
- **—** = non applicabile

---

## Ruoli disponibili

| Ruolo | Costante | Dichiarato in |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x00` (OZ default) | OZ AccessControl |
| `UPGRADER_ROLE` | `keccak256("UPGRADER_ROLE")` | Token |
| `MINTER_ROLE` | `keccak256("MINTER_ROLE")` | Token |
| `BURNER_ROLE` | `keccak256("BURNER_ROLE")` | Token |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` | Token |
| `FREEZER_ROLE` | `keccak256("FREEZER_ROLE")` | ERC20FreezableUpgradeable |
| `BLOCKER_ROLE` | `keccak256("BLOCKER_ROLE")` | ERC20BlocklistUpgradeable |
| `FEE_MANAGER_ROLE` | `keccak256("FEE_MANAGER_ROLE")` | FeeManagerRole (condiviso da transfer fee e custody fee) |
| `RECOVERER_ROLE` | `keccak256("RECOVERER_ROLE")` | ERC20RecoverableUpgradeable |

**Grant in `initialize`**: il `defaultAdmin_` riceve solo i ruoli di governance
(`DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, `FEE_MANAGER_ROLE`, `RECOVERER_ROLE`).
I ruoli operativi (`MINTER`, `BURNER`, `PAUSER`, `FREEZER`, `BLOCKER`) vanno assegnati
post-deploy a indirizzi dedicati via `scripts/roles/grant_roles.ts` (principio del
minimo privilegio).

---

## Matrice Metodi × Ruoli

| Metodo | ADMIN | UPGRADER | MINTER | BURNER | PAUSER | FREEZER | BLOCKER | FEE_MANAGER | RECOVERER | Chiunque |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **— UUPS UPGRADE —** | | | | | | | | | | |
| `upgradeToAndCall(address, bytes)` | — | ✅ | — | — | — | — | — | — | — | — |
| **— SUPPLY —** | | | | | | | | | | |
| `mint(address, uint256)` | — | — | ✅ | — | — | — | — | — | — | — |
| `burn(address, uint256)` | — | — | — | ✅ | — | — | — | — | — | — |
| **— PAUSE —** | | | | | | | | | | |
| `pause()` / `unpause()` | — | — | — | — | ✅ | — | — | — | — | — |
| `paused()` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— FREEZE (binario) —** | | | | | | | | | | |
| `freeze(address)` / `unfreeze(address)` | — | — | — | — | — | ✅ | — | — | — | — |
| `isFrozen(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— BLOCKLIST —** | | | | | | | | | | |
| `blockAccount(address)` / `unblockAccount(address)` | — | — | — | — | — | — | ✅ | — | — | — |
| `isBlocked(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— TRANSFER FEE —** | | | | | | | | | | |
| `setTransferFeeBps(uint256)` (cap 100) | — | — | — | — | — | — | — | ✅ | — | — |
| `setFeeCollector(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `addTransferFeeExempt(address)` / `removeTransferFeeExempt(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `transferFeeBps()` / `feeCollector()` / `isTransferFeeExempt(address)` / `getTransferFeeExemptList()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `previewNet(uint256)` / `previewGross(uint256)` / `maxNetTransferable(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— CUSTODY FEE —** | | | | | | | | | | |
| `setCustodyFeeBps(uint256)` (cap 200) | — | — | — | — | — | — | — | ✅ | — | — |
| `setCustodyTreasury(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `addCustodyFeeExempt(address)` / `removeCustodyFeeExempt(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `startNewCycle()` | — | — | — | — | — | — | — | ✅ | — | — |
| `sweepCustodyFee(address[])` | — | — | — | — | — | — | — | ✅ | — | — |
| `custodyFeeBps()` / `custodyTreasury()` / `currentCycle()` / `lastSweptCycle(address)` / `isCustodyFeeExempt(address)` / `getCustodyFeeExemptList()` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— RECOVERY —** | | | | | | | | | | |
| `recoverERC20(address, address, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverNative(address payable, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverERC721(address, address, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| **— ACCESS CONTROL —** | | | | | | | | | | |
| `grantRole(bytes32, address)` / `revokeRole(bytes32, address)` | ✅ | — | — | — | — | — | — | — | — | — |
| `renounceRole(bytes32, address)` | — | — | — | — | — | — | — | — | — | 👁️* |
| `hasRole(bytes32, address)` / `getRoleAdmin(bytes32)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-20 STANDARD —** | | | | | | | | | | |
| `transfer` / `transferFrom` / `approve` / `allowance` / `balanceOf` / `totalSupply` / `name` / `symbol` / `decimals` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-2612 PERMIT —** | | | | | | | | | | |
| `permit(...)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `nonces(address)` / `DOMAIN_SEPARATOR()` / `eip712Domain()` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-3009 —** | | | | | | | | | | |
| `transferWithAuthorization(...)` / `receiveWithAuthorization(...)` / `cancelAuthorization(...)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `authorizationState(address, bytes32)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-1363 —** | | | | | | | | | | |
| `transferAndCall(...)` / `transferFromAndCall(...)` / `approveAndCall(...)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `supportsInterface(bytes4)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— METADATA —** | | | | | | | | | | |
| `version()` → `"2.1.0"` | — | — | — | — | — | — | — | — | — | 👁️ |

> \* `renounceRole` è chiamabile solo dall'account stesso che rinuncia al proprio ruolo.

---

## Note sul controllo degli accessi

- **`DEFAULT_ADMIN_ROLE`** è il role admin di tutti gli altri ruoli: può fare `grantRole`
  e `revokeRole` per qualsiasi ruolo.
- **`UPGRADER_ROLE`** autorizza `_authorizeUpgrade` (UUPS `upgradeToAndCall`).
- **`FEE_MANAGER_ROLE`** governa ENTRAMBE le fee (scambio e custodia), i cicli e lo sweep
  (decisione D2 in SPEC_FEE_CUSTODIA.md). Per la procedura di sweep completa
  (`pause()` → batch → `unpause()`) l'operatore ha bisogno anche di `PAUSER_ROLE`
  o del supporto di chi lo detiene.
- I metodi **EIP-3009** e **EIP-2612** non richiedono ruoli: la sicurezza è garantita
  dalla firma ECDSA off-chain del titolare.
- **Fee sui percorsi di trasferimento** (tutti soggetti a pause/block/freeze):
  - `transfer`/`transferFrom`: fee **dedotta** dall'importo (il destinatario riceve il netto);
  - ERC-1363 / EIP-3009: il destinatario riceve **esattamente** il valore indicato,
    il mittente paga valore + fee (allowance sul lordo per `transferFromAndCall`).
- **`sweepCustodyFee`** bypassa pause, blocklist, freeze e transfer fee (decisione D3):
  la custodia si preleva anche da account bloccati/congelati e a token in pausa.
- Le funzioni `freeze`/`unfreeze`/`blockAccount`/`unblockAccount` e add/remove exemption
  sono **idempotenti**: nessun revert e nessun evento se lo stato è già quello richiesto.
