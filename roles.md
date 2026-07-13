# Roles & Methods Matrix — Token v2.5.0

Legenda:
- **✅** = può chiamare il metodo (richiede il ruolo)
- **👁️** = metodo pubblico/view, chiamabile da chiunque (nessun ruolo richiesto)
- **🔑** = richiede firma valida EIP-712 del titolare dei token, nessun ruolo on-chain
- **—** = non applicabile

---

## Ruoli disponibili

| Ruolo | Costante | Dichiarato in |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x00` (OZ default) | `AccessControlDefaultAdminRulesUpgradeable` |
| `UPGRADER_ROLE` | `keccak256("UPGRADER_ROLE")` | Token |
| `MINTER_ROLE` | `keccak256("MINTER_ROLE")` | Token |
| `BURNER_ROLE` | `keccak256("BURNER_ROLE")` | Token |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` | Token |
| `FREEZER_ROLE` | `keccak256("FREEZER_ROLE")` | ERC20FreezableUpgradeable |
| `BLOCKER_ROLE` | `keccak256("BLOCKER_ROLE")` | ERC20BlocklistUpgradeable |
| `FEE_ADMIN_ROLE` | `keccak256("FEE_ADMIN_ROLE")` | FeeRoles (governance: parametri transfer/custody fee) |
| `SWEEPER_ROLE` | `keccak256("SWEEPER_ROLE")` | FeeRoles (operativo: cicli e sweep custodia) |
| `RECOVERER_ROLE` | `keccak256("RECOVERER_ROLE")` | ERC20RecoverableUpgradeable |

**v2.4.0 — split di ruolo**: il precedente `FEE_MANAGER_ROLE` unico è stato diviso in
`FEE_ADMIN_ROLE` (governance: chi imposta fee/collector/treasury/esenzioni — pochi
cambi, chiave fredda o multisig) e `SWEEPER_ROLE` (operativo: chi esegue
`startNewCycle`/`sweepCustodyFee` — centinaia di tx per batch, hot wallet). Principio
del minimo privilegio: una chiave calda compromessa non può più alterare i parametri
economici del token, solo eseguire lo sweep già configurato.

**Grant in `initialize`**: il `defaultAdmin_` riceve solo i ruoli di governance
(`DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, `FEE_ADMIN_ROLE`, `RECOVERER_ROLE`).
I ruoli operativi (`MINTER`, `BURNER`, `PAUSER`, `FREEZER`, `BLOCKER`, `SWEEPER`) vanno
assegnati post-deploy a indirizzi dedicati via `scripts/roles/grant_roles.ts`
(principio del minimo privilegio).

---

## Matrice Metodi × Ruoli

| Metodo | ADMIN | UPGRADER | MINTER | BURNER | PAUSER | FREEZER | BLOCKER | FEE_ADMIN | SWEEPER | RECOVERER | Chiunque |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **— UUPS UPGRADE —** | | | | | | | | | | | |
| `upgradeToAndCall(address, bytes)` | — | ✅ | — | — | — | — | — | — | — | — | — |
| **— SUPPLY —** | | | | | | | | | | | |
| `mint(address, uint256)` | — | — | ✅ | — | — | — | — | — | — | — | — |
| `burn(address, uint256)` | — | — | — | ✅ | — | — | — | — | — | — | — |
| **— PAUSE —** | | | | | | | | | | | |
| `pause()` / `unpause()` | — | — | — | — | ✅ | — | — | — | — | — | — |
| `paused()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— FREEZE (binario) —** | | | | | | | | | | | |
| `freeze(address)` / `unfreeze(address)` | — | — | — | — | — | ✅ | — | — | — | — | — |
| `isFrozen(address)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— BLOCKLIST —** | | | | | | | | | | | |
| `blockAccount(address)` / `unblockAccount(address)` | — | — | — | — | — | — | ✅ | — | — | — | — |
| `isBlocked(address)` / `isRestricted(address)` (=blocked‖frozen, v2.5.0) | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— TRANSFER FEE (governance) —** | | | | | | | | | | | |
| `setTransferFeeBps(uint256)` (cap 100) | — | — | — | — | — | — | — | ✅ | — | — | — |
| `setFeeCollector(address)` | — | — | — | — | — | — | — | ✅ | — | — | — |
| `addTransferFeeExempt(address)` / `removeTransferFeeExempt(address)` | — | — | — | — | — | — | — | ✅ | — | — | — |
| `transferFeeBps()` / `feeCollector()` / `isTransferFeeExempt(address)` / `getTransferFeeExemptList()` / `getTransferFeeExemptCount()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| `previewNet(uint256)` / `previewGross(uint256)` / `maxNetTransferable(address)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— CUSTODY FEE — parametri (governance) —** | | | | | | | | | | | |
| `setCustodyFeeBps(uint256)` (cap 200) | — | — | — | — | — | — | — | ✅ | — | — | — |
| `setCustodyTreasury(address)` | — | — | — | — | — | — | — | ✅ | — | — | — |
| `addCustodyFeeExempt(address)` / `removeCustodyFeeExempt(address)` | — | — | — | — | — | — | — | ✅ | — | — | — |
| **— CUSTODY FEE — operativo (v2.4.0: SWEEPER, non più FEE_ADMIN) —** | | | | | | | | | | | |
| `startNewCycle()` | — | — | — | — | — | — | — | — | ✅ | — | — |
| `sweepCustodyFee(address[])` | — | — | — | — | — | — | — | — | ✅ | — | — |
| `custodyFeeBps()` / `custodyTreasury()` / `currentCycle()` / `lastSweptCycle(address)` / `isCustodyFeeExempt(address)` / `getCustodyFeeExemptList()` / `getCustodyFeeExemptCount()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— RECOVERY —** | | | | | | | | | | | |
| `recoverERC20(address, address, uint256)` | — | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverNative(address payable, uint256)` | — | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverERC721(address, address, uint256)` | — | — | — | — | — | — | — | — | — | ✅ | — |
| **— CONTRACT URIs (v2.4.0) —** | | | | | | | | | | | |
| `setWebsiteURI(string)` / `setReserveInfoURI(string)` / `setContractURI(string)` | ✅ | — | — | — | — | — | — | — | — | — | — |
| `websiteURI()` / `reserveInfoURI()` / `contractURI()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ACCESS CONTROL —** | | | | | | | | | | | |
| `grantRole(bytes32, address)` / `revokeRole(bytes32, address)` — ruoli ordinari | ✅ | — | — | — | — | — | — | — | — | — | — |
| `grantRole` / `revokeRole` su `DEFAULT_ADMIN_ROLE` | ❌* | — | — | — | — | — | — | — | — | — | — |
| `renounceRole(bytes32, address)` — ruoli ordinari | — | — | — | — | — | — | — | — | — | — | 👁️** |
| `renounceRole(DEFAULT_ADMIN_ROLE, ...)` | 👁️*** | — | — | — | — | — | — | — | — | — | — |
| `hasRole(bytes32, address)` / `getRoleAdmin(bytes32)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— GOVERNANCE HANDOVER (v2.4.0, AccessControlDefaultAdminRules) —** | | | | | | | | | | | |
| `beginDefaultAdminTransfer(address)` / `cancelDefaultAdminTransfer()` / `changeDefaultAdminDelay(uint48)` / `rollbackDefaultAdminDelay()` | ✅ | — | — | — | — | — | — | — | — | — | — |
| `acceptDefaultAdminTransfer()` | 👁️**** | — | — | — | — | — | — | — | — | — | — |
| `owner()` / `defaultAdmin()` / `pendingDefaultAdmin()` / `defaultAdminDelay()` / `pendingDefaultAdminDelay()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-20 STANDARD —** | | | | | | | | | | | |
| `transfer` / `transferFrom` / `approve` / `allowance` / `balanceOf` / `totalSupply` / `name` / `symbol` / `decimals` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-2612 PERMIT —** | | | | | | | | | | | |
| `permit(...)` | — | — | — | — | — | — | — | — | — | — | 🔑 |
| `nonces(address)` / `DOMAIN_SEPARATOR()` / `eip712Domain()` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-3009 —** | | | | | | | | | | | |
| `transferWithAuthorization(...)` / `receiveWithAuthorization(...)` / `cancelAuthorization(...)` | — | — | — | — | — | — | — | — | — | — | 🔑 |
| `authorizationState(address, bytes32)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-1363 —** | | | | | | | | | | | |
| `transferAndCall(...)` / `transferFromAndCall(...)` / `approveAndCall(...)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| `supportsInterface(bytes4)` | — | — | — | — | — | — | — | — | — | — | 👁️ |
| **— METADATA —** | | | | | | | | | | | |
| `version()` → `"2.5.0"` | — | — | — | — | — | — | — | — | — | — | 👁️ |

> \* Reverte SEMPRE, incondizionatamente, anche per il titolare di `DEFAULT_ADMIN_ROLE` —
>   protezione contro un `DEFAULT_ADMIN_ROLE` riassegnabile fuori dal flusso a due fasi.
>
> \*\* `renounceRole` su un ruolo ordinario è chiamabile solo dall'account stesso che rinuncia.
>
> \*\*\* `renounceRole(DEFAULT_ADMIN_ROLE, account)` richiede che `account` sia
>   l'attuale `defaultAdmin()` E che sia già stato schedulato (e trascorso il delay)
>   un `beginDefaultAdminTransfer(address(0))` — altrimenti reverte con
>   `AccessControlEnforcedDefaultAdminDelay`.
>
> \*\*\*\* Chiamabile solo dall'indirizzo restituito da `pendingDefaultAdmin()`, e solo
>   dopo che il relativo `schedule` è trascorso — altrimenti reverte rispettivamente
>   con `AccessControlInvalidDefaultAdmin` o `AccessControlEnforcedDefaultAdminDelay`.

---

## Note sul controllo degli accessi

- **`DEFAULT_ADMIN_ROLE`** è il role admin di tutti gli altri ruoli: può fare `grantRole`
  e `revokeRole` per qualsiasi ruolo TRANNE se stesso. Il proprio transfer segue il
  flusso a due fasi di `AccessControlDefaultAdminRulesUpgradeable` — vedi GOVERNANCE.md
  e RUNBOOK_UPGRADE.md.
- **`UPGRADER_ROLE`** autorizza `_authorizeUpgrade` (UUPS `upgradeToAndCall`).
- **`FEE_ADMIN_ROLE`** governa i PARAMETRI di entrambe le fee (scambio e custodia):
  bps, collector, treasury, esenzioni. NON può eseguire `startNewCycle`/`sweepCustodyFee`
  — quello è `SWEEPER_ROLE` (split v2.4.0, decisione presa in PIANO_LAVORI.md §0.2/§0.3).
- **`SWEEPER_ROLE`** esegue solo `startNewCycle()` e `sweepCustodyFee(address[])`. Per
  la procedura di sweep completa (`pause()` → batch → `unpause()`) l'operatore ha
  bisogno anche di `PAUSER_ROLE` o del supporto di chi lo detiene.
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
- **`websiteURI`/`reserveInfoURI`/`contractURI`** sono pointer informativi (non prove
  crittografiche) gestiti da `DEFAULT_ADMIN_ROLE` — `reserveInfoURI` in particolare è
  l'ancora di fiducia per le attestazioni di proof-of-reserve (vedi PEG_ORO.md), quindi
  NON è delegato a `FEE_ADMIN_ROLE`/`SWEEPER_ROLE` per evitare che una chiave operativa
  compromessa possa redirigerlo verso un phishing.
