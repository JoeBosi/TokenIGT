# AGENTS.md — Specifica operativa per Copilot Agents
## Token ERC-20 avanzato — OpenZeppelin v5.6.1 (UUPS)
**Versione:** 2.1 — con fix sicurezza v1.6.3
**Data:** 2026-05-18

**Stato:** ✅ Tutti i 9 punti di sicurezza/observabilità completati e deployati su Amoy

Questo file definisce **come gli agenti AI devono lavorare** per generare, testare, aggiornare e deployare il token ERC-20 avanzato.

Tutto è pensato per **Hardhat 2.22+**, **OpenZeppelin Contracts 5.6.1**, **pnpm**, e per un flusso di sviluppo pulito, modulare e completamente testato.

> **⚠️ Vincoli inderogabili per gli agent (leggere prima di scrivere qualsiasi riga di codice):**
>
> 1. Usare **esclusivamente** la versione `5.6.1` di `@openzeppelin/contracts` e `@openzeppelin/contracts-upgradeable`.
> 2. **NON** dipendere da `@openzeppelin/community-contracts`: i moduli Freezable e Restricted vanno **reimplementati inline** secondo la spec della sezione 11.
> 3. In OZ v5 esiste **solo** `upgradeToAndCall(address, bytes)` — `upgradeTo(address)` è stato rimosso a partire da v5.0.0-rc.0. Non includerlo né nei contratti né nei test.
> 4. Pattern di storage: **ERC-7201 Namespaced Storage** per tutta la logica custom (Fee, Freezable, Restricted, EIP-3009, ecc.). Vedi sezione 10. **Niente `__gap`**.
> 5. Pragma Solidity: `^0.8.28`.
> 6. Pattern proxy: **UUPS** (ERC-1822) tramite `@openzeppelin/hardhat-upgrades`.

---

## 1. Stack tecnologico

| Componente | Versione |
|---|---|
| Solidity | `^0.8.28` |
| `@openzeppelin/contracts` | `5.6.1` |
| `@openzeppelin/contracts-upgradeable` | `5.6.1` |
| `@openzeppelin/hardhat-upgrades` | `^3.0.0` |
| Hardhat | `^2.22.0` (stabile — restiamo su v2 finché v3 non avrà `hardhat-deploy`, gas reporter e Ledger) |
| Package manager | `pnpm` |
| Test framework | Mocha + Chai (TypeScript) + `@nomicfoundation/hardhat-toolbox` |
| Coverage | `solidity-coverage` |
| Proxy pattern | UUPS (ERC-1822 + ERC-1967) |
| Storage pattern | ERC-7201 Namespaced Storage |
| Compiler optimizer | `enabled: true, runs: 200` |
| EVM target | `cancun` (default per 0.8.28) |

**Standard implementati:**
- ERC-20, ERC-20 Permit (EIP-2612), ERC-20 Pausable
- EIP-712, EIP-5267 (`eip712Domain`)
- EIP-3009 (Transfer With Authorization)
- ERC-1363 (Payable Token con callback) + ERC-165
- AccessControl con ruoli granulari + nuovo `RECOVERER_ROLE`

---

## 2. Struttura directory (obbligatoria)

Gli agent devono generare **esattamente** questa struttura:

```
project-root/
│
├── contracts/
│   ├── Token.sol                          # Implementazione V1 (entry point)
│   ├── TokenV2.sol                        # V2 per test forward upgrade
│   ├── TokenV3.sol                        # V3 per test compatibility upgrade
│   ├── extensions/
│   │   ├── ERC20FreezableUpgradeable.sol  # Custom (sezione 11.1)
│   │   ├── ERC20RestrictedUpgradeable.sol # Custom (sezione 11.2)
│   │   ├── ERC20FeeUpgradeable.sol        # Fee + whitelist + cap (sezione 8)
│   │   ├── ERC20EIP3009Upgradeable.sol    # Transfer With Authorization
│   │   ├── ERC20_1363Upgradeable.sol      # ERC-1363 callback + ERC-165
│   │   └── ERC20RecoverableUpgradeable.sol# recoverERC20/ETH/ERC721 (sezione 14)
│   ├── interfaces/
│   │   ├── IERC1363.sol
│   │   ├── IERC1363Receiver.sol
│   │   ├── IERC1363Spender.sol
│   │   └── IERC3009.sol
│   └── mocks/
│       ├── MockERC1363Receiver.sol
│       ├── MockERC1363Spender.sol
│       ├── MockERC20.sol                  # per testare recoverERC20
│       └── MockERC721.sol                 # per testare recoverERC721
│
├── scripts/
│   ├── deploy/
│   │   ├── deploy_local.ts
│   │   ├── deploy_amoy.ts
│   │   ├── deploy_polygon.ts
│   │   └── verify.ts
│   ├── upgrade/
│   │   ├── upgrade_local.ts
│   │   ├── upgrade_amoy.ts
│   │   └── upgrade_polygon.ts
│   └── roles/
│       ├── grant_roles.ts
│       ├── revoke_roles.ts
│       └── list_roles.ts
│
├── test/
│   ├── core/
│   │   ├── token.core.spec.ts             # ERC-20 base + eventi
│   │   ├── token.roles.spec.ts            # AccessControl, grant/revoke/renounce
│   │   ├── token.pause.spec.ts            # Pausable + matrice sezione 9
│   │   ├── token.supply.spec.ts           # mint/burn + cap (nessun cap su mint)
│   │   └── token.metadata.spec.ts         # name/symbol/decimals
│   ├── features/
│   │   ├── token.fee.spec.ts              # fee + whitelist + cap 999 bp + edge cases
│   │   ├── token.freeze.spec.ts
│   │   ├── token.block.spec.ts
│   │   ├── token.permit.spec.ts           # EIP-2612
│   │   ├── token.eip5267.spec.ts          # eip712Domain()
│   │   ├── token.erc1363.spec.ts
│   │   ├── token.eip3009.spec.ts
│   │   ├── token.recover.spec.ts
│   │   └── token.interactions.spec.ts     # fee × permit × 3009 × 1363 × pause × freeze × block
│   └── upgrade/
│       ├── upgrade.forward.spec.ts        # V1 → V2 con nuove variabili
│       ├── upgrade.compatibility.spec.ts  # V2 → V3 mantenendo layout
│       └── storage.layout.spec.ts         # validazione namespaced layout
│
├── abi/                                   # generato automaticamente post-compile
│   ├── Token.json
│   ├── TokenV2.json
│   ├── TokenV3.json
│   └── ERC1967Proxy.json
│
├── deployments/
│   ├── local/
│   │   ├── proxy.json
│   │   ├── implementation.json
│   │   └── roles.json
│   ├── amoy/
│   └── polygon/
│
├── .env
├── .env.example
├── hardhat.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. File `.env` — assegnazione ruoli e indirizzi

> **⚠️ Sicurezza:** la `PRIVATE_KEY` qui sotto è solo del **deployer** (titolare di `DEFAULT_ADMIN_ROLE`). Le chiavi private degli altri ruoli **non devono mai entrare in questo file**: i ruoli vengono assegnati on-chain con `grantRole` dal deployer dopo `initialize()`.

```bash
# ─────────────────────────────────────────────
# 3.1 — RETE
# ─────────────────────────────────────────────
PRIVATE_KEY=
POLYGONSCAN_API_KEY=
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_RPC_URL=https://polygon-rpc.com

# ─────────────────────────────────────────────
# 3.2 — INDIRIZZI DEI RUOLI (testnet Amoy)
# ─────────────────────────────────────────────
# RUOLI CRITICI — devono essere wallet distinti (separazione di rischio):
DEFAULT_ADMIN_ADDRESS=0x2d6ecb55771f262f99f9df8163910b1968a7862f
UPGRADER_ADDRESS=0x15CA765a1D8ce75a8B419F7A79bDe38e7AaD95E0
MINTER_ADDRESS=0x5366053a98f10e8cded12af53aaa6afd33a14a5a
BURNER_ADDRESS=0xfCb48aDbb480376089921b0A65B5022cB7EC3588

# RUOLI OPERATIVI — wallet dedicato:
PAUSER_ADDRESS=0x518322969492b8e52ca5d2eb1bc6c0d2f45d5892

# RUOLI DI RESTRIZIONE — possono condividere wallet su testnet:
FREEZER_ADDRESS=0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1
BLOCKER_ADDRESS=0xf86063dDDDC0b841Ff3FBBa8a4A5E524f3D164c1

# RUOLI DI CONFIGURAZIONE — condividono wallet con DEFAULT_ADMIN su testnet:
FEE_ADMIN_ADDRESS=0x2d6ecb55771f262f99f9df8163910b1968a7862f
RECOVERER_ADDRESS=0x2d6ecb55771f262f99f9df8163910b1968a7862f

# DESTINATARI:
FEE_COLLECTOR_ADDRESS=0x2d6ecb55771f262f99f9df8163910b1968a7862f
INITIAL_HOLDER_ADDRESS=0x2d6ecb55771f262f99f9df8163910b1968a7862f

# ─────────────────────────────────────────────
# 3.3 — INDIRIZZI DI TEST (utenti SENZA ruoli)
# ─────────────────────────────────────────────
USER1_ADDRESS=0xB15a4A995050b5DdE912c1a948fF49b2a2E7d615
USER2_ADDRESS=0x35744Db4a90e39648C45921dd039168EeAa2B5cf

# ─────────────────────────────────────────────
# 3.4 — INDIRIZZI DEL DEPLOY (popolati dallo script)
# ─────────────────────────────────────────────
PROXY_ADDRESS=
IMPLEMENTATION_ADDRESS=

# ─────────────────────────────────────────────
# 3.5 — CONFIGURAZIONE TOKEN
# ─────────────────────────────────────────────
TOKEN_NAME=Advanced Token
TOKEN_SYMBOL=ADVT
TOKEN_DECIMALS=18

# Supply iniziale in wei (10.000 token × 1e18):
INITIAL_SUPPLY=10000000000000000000000

# Fee iniziale in basis points (10 = 0,10%). Cap on-chain = 999 (9,99%):
TRANSACTION_FEE_BASIS_POINTS=10
```

### 3.6 Note sulla concentrazione di ruoli su testnet

Con gli **8 wallet** disponibili abbiamo dovuto condividere alcuni ruoli. Le condivisioni sono accettabili **solo su testnet**:

| Wallet | Ruoli assegnati |
|---|---|
| `0x2d6e…62f` | `DEFAULT_ADMIN_ROLE`, `FEE_ADMIN_ROLE`, `RECOVERER_ROLE`, fee collector, initial holder |
| `0xf860…4c1` | `FREEZER_ROLE` + `BLOCKER_ROLE` (entrambi di restrizione) |

Le **separazioni critiche** sono però **mantenute integralmente**:

- `DEFAULT_ADMIN_ROLE` ≠ `UPGRADER_ROLE` ≠ `MINTER_ROLE` ≠ `BURNER_ROLE`
- Questi 4 ruoli sono su 4 wallet diversi: nessuna singola chiave compromessa può causare contemporaneamente mint infinito + upgrade malevolo, né burn arbitrario + manipolazione dei ruoli.

### 3.7 ⚠️ Cambiamenti obbligatori per il deploy su Polygon mainnet

Prima del deploy su mainnet, **tutti** i ruoli critici devono essere riassegnati a:

- **Gnosis Safe multisig (≥ 2/3 firmatari)** per `DEFAULT_ADMIN_ROLE` e `UPGRADER_ROLE`.
- **`TimelockController` con delay ≥ 48h** interposto tra il Safe e il contratto per gli upgrade.
- **Multisig 1/N o hardware wallet** per `MINTER_ROLE`, `BURNER_ROLE`, `PAUSER_ROLE`, `FREEZER_ROLE`, `BLOCKER_ROLE`, `FEE_ADMIN_ROLE`, `RECOVERER_ROLE`.

Il deploy su mainnet sarà oggetto di un `AGENTS.md` separato (`AGENTS.mainnet.md`).

---

## 4. Regole per i deploy

### 4.1 Deploy locale (`scripts/deploy/deploy_local.ts`)

- Rete: `hardhat` (in-memory)
- Deploy via `upgrades.deployProxy(Token, [initArgs], { kind: 'uups' })`
- Nessuna verifica esterna
- Salva ABI in `abi/`
- Salva indirizzi in `deployments/local/{proxy,implementation,roles}.json`

### 4.2 Deploy su Amoy (`scripts/deploy/deploy_amoy.ts`)

- RPC: `AMOY_RPC_URL`
- chainId: **80002**
- Token nativo: **POL**
- Verifica su Polygonscan via `POLYGONSCAN_API_KEY`
- Salva in `deployments/amoy/`

### 4.3 Deploy su Polygon mainnet (`scripts/deploy/deploy_polygon.ts`)

- chainId: **137**
- Token nativo: **POL**
- Verifica su Polygonscan
- Salva in `deployments/polygon/`
- ⚠️ **Lo script DEVE controllare in testa** che `DEFAULT_ADMIN_ADDRESS` e `UPGRADER_ADDRESS` siano contract address (multisig) e non EOA, altrimenti revert prima di deployare.

### 4.4 Sequenza di deploy comune a tutte le reti

Ogni script di deploy DEVE eseguire **in quest'ordine**:

1. Deploy implementazione + proxy ERC-1967 via `upgrades.deployProxy(...)`.
2. Validazione `proxiableUUID()` automatica del plugin OZ Upgrades.
3. (`initialize()` ha già assegnato `DEFAULT_ADMIN_ROLE` al deployer).
4. Lo script chiama `grantRole(R, X)` per ciascun ruolo `R` verso l'indirizzo `X` configurato in `.env`.
5. **`renounceRole`** del deployer su tutti i ruoli che non gli competono (mantiene solo `DEFAULT_ADMIN_ROLE`, `FEE_ADMIN_ROLE` e `RECOVERER_ROLE` per coerenza con la sezione 3.6).
6. Verifica finale: per ogni ruolo, `getRoleMemberCount(role)` deve corrispondere al numero atteso.
7. Scrittura dei file `deployments/<rete>/{proxy,implementation,roles}.json`.

---

## 5. Generazione ABI (automatica)

Hook post-compile in `hardhat.config.ts` che copia gli ABI di `Token`, `TokenV2`, `TokenV3` e `ERC1967Proxy` in `abi/`:

```typescript
import { task } from "hardhat/config";
task("compile").setAction(async (_, hre, runSuper) => {
  await runSuper();
  // Per ogni contratto in CONTRACTS_TO_EXPORT: legge l'artifact e scrive abi/<Nome>.json
});
```

**Output:**

- `abi/Token.json` — ABI implementazione V1
- `abi/TokenV2.json` — ABI implementazione V2
- `abi/TokenV3.json` — ABI implementazione V3
- `abi/ERC1967Proxy.json` — ABI del proxy standard (per integrazione frontend)

---

## 6. Generazione test — copertura obbligatoria

Gli agent devono generare test **per ogni metodo e attributo**. Lista minima:

### 6.1 Core

- ERC-20: `transfer`, `transferFrom`, `approve`, `allowance`, `balanceOf`, `totalSupply` + tutti gli eventi.
- Metadata: `name`, `symbol`, `decimals` (deve essere 18).
- AccessControl: `grantRole`, `revokeRole`, `renounceRole`, `hasRole`, `getRoleAdmin`, `getRoleMember`.
- Pausable: `pause`, `unpause`, comportamento di ogni funzione sotto pausa (matrice sezione 9).

### 6.2 Features

- Supply: `mint` (solo MINTER), `burn` (solo BURNER, può colpire **qualsiasi** indirizzo). Nessun cap di supply: testare anche mint di importi enormi.
- Freeze: `freeze`, `freezeAll`, `unfreeze`, `reduceFrozen`, `frozenOf`, `availableBalanceOf` + revert su transfer da indirizzo con saldo non congelato insufficiente.
- Block: `blockUser`, `resetUser`, `isBlocked` + revert su transfer da/verso indirizzo bloccato, **incluso** mint e burn verso indirizzo bloccato.
- Fee: `setFee` (con cap 999 bp, revert se eccede), `setFeeCollector`, `addFeeFree`, `removeFeeFree`, applicazione fee in `_update`, esenzione mint, esenzione burn, esenzione whitelist (entrambe le direzioni), **short-circuit su `_fee == 0`**.
- Permit (EIP-2612): firma valida, `nonces` incrementali, scadenza, replay protection.
- EIP-5267: `eip712Domain()` ritorna correttamente i 7 campi.
- EIP-3009: `transferWithAuthorization`, `receiveWithAuthorization` (chiamabile solo dal `to`), `cancelAuthorization`, `authorizationState`, replay protection, scadenza, validBefore/validAfter.
- ERC-1363: `transferAndCall`, `transferFromAndCall`, `approveAndCall` con/senza data, callback su contratti compliant, revert su contratti non compliant, `supportsInterface` ritorna true per `IERC1363` e `IERC20`.
- Recovery: `recoverERC20` (anche su `address(this)`), `recoverETH`, `recoverERC721`, `receive()` payable, `onERC721Received`.

### 6.3 Upgrade

- Forward V1 → V2 (sezione 7.1)
- Compatibility V2 → V3 (sezione 7.2)
- Storage layout namespaced (sezione 7.3)

### 6.4 Interazioni cross-feature

In `test/features/token.interactions.spec.ts`:

- Fee × Permit (l'`approve` non subisce fee, il `transferFrom` successivo sì)
- Fee × EIP-3009 (`value` firmato ≠ `value` ricevuto se fee > 0 e parti non in whitelist)
- Fee × ERC-1363 (la callback riceve il valore netto)
- Pause × ogni funzione (matrice 9)
- Freeze × transfer / transferFrom / EIP-3009 / ERC-1363
- Block × transfer / mint / burn
- Freeze + Burn (BURNER **può** bruciare token congelati — pattern di confisca)
- Fee + Mint (mint NON paga fee)
- Fee + Burn (burn NON paga fee)

### 6.5 Target di coverage

- **100%** su statements, branches, functions per i moduli custom (Fee, Freezable, Restricted, EIP-3009, Recoverable).
- **≥ 90%** sul contratto principale `Token.sol`.
- Per i moduli ereditati OZ è sufficiente happy path + revert path principale.

---

## 7. Simulazione upgrade — specifica dettagliata

### 7.1 Test "forward upgrade" V1 → V2 (`upgrade.forward.spec.ts`)

**Scopo:** verificare che un upgrade UUPS che aggiunge nuova logica e nuovo storage **non corrompa** lo stato preesistente.

**`TokenV2` deve aggiungere:**

- Una nuova variabile di storage `uint256 v2NewCounter` — **dentro un proprio namespaced storage** con `@custom:storage-location erc7201:advanced.token.v2`.
- Un nuovo metodo pubblico `incrementV2Counter()` che incrementa il counter.
- Una nuova funzione `initializeV2()` decorata con `reinitializer(2)` per impostare valori di default.

**Flusso del test:**

1. Deploy V1 via proxy.
2. Popolazione di stato significativo:
   - mint per due indirizzi diversi
   - imposta una fee (es. 50 bp)
   - aggiunge un indirizzo alla `feeFreeList`
   - congela parzialmente un saldo via `freeze()`
   - blocca un terzo indirizzo via `blockUser()`
   - esegue almeno 2 `permit` per popolare `nonces`
   - esegue almeno 1 `transferWithAuthorization` per popolare `authorizationState`
3. **Snapshot** dello stato pre-upgrade: `totalSupply`, `balanceOf(...)` per ogni address, `fee()`, `feeCollector()`, `isFeeFree(...)`, `frozenOf(...)`, `isBlocked(...)`, `nonces(...)`, `authorizationState(...)`, tutti i `hasRole(...)`.
4. Upgrade: `upgrades.upgradeProxy(proxy, TokenV2, { call: { fn: 'initializeV2', args: [...] } })`.
5. **Verifiche post-upgrade:**
   - L'address dell'implementazione nello slot ERC-1967 è cambiato (`getImplementationAddress`).
   - **Tutti** i valori dello snapshot pre-upgrade sono identici dopo l'upgrade.
   - `v2NewCounter == 0` (storage nuovo, vergine).
   - `incrementV2Counter()` funziona e porta il counter a 1.
   - `_authorizeUpgrade` continua a richiedere `UPGRADER_ROLE`: un account senza il ruolo riceve revert su un secondo tentativo di upgrade.
   - Tutti i ruoli AccessControl sono ancora attivi.
   - I trasferimenti normali continuano a funzionare e applicano la fee come prima.

### 7.2 Test "compatibility upgrade" V2 → V3 (`upgrade.compatibility.spec.ts`)

> **Chiarimento terminologico:** UUPS **non supporta rollback nativo**. Quello che testiamo qui è la *compatibilità in avanti*: V3 mantiene il layout di V2 (compresi gli slot di variabili che V3 non usa più), dimostrando che si può "deprecare logicamente" una funzionalità **senza** mai rimuovere lo storage che la sostiene. È il pattern corretto per un'evoluzione safe.

**`TokenV3` deve:**

- Mantenere **tutte** le variabili di storage di V2 (lo slot `v2NewCounter` resta dichiarato anche se non più letto/scritto).
- Sostituire `incrementV2Counter()` con una versione che fa revert con `error DeprecatedV2Counter();`.
- Aggiungere una **nuova** variabile di storage `uint256 maxTransferAmount` nel proprio namespaced storage `erc7201:advanced.token.v3`.
- Aggiungere un metodo `setMaxTransferAmount(uint256)` protetto da `FEE_ADMIN_ROLE` (sostituisce concettualmente il counter precedente).
- Hook in `_update` che fa revert se `value > maxTransferAmount` (con `maxTransferAmount == 0` significa "nessun limite", per retrocompatibilità).
- Una `initializeV3()` con `reinitializer(3)` che imposta `maxTransferAmount = 0`.

**Flusso del test:**

1. Parte dallo stato finale del test 7.1 (V2 già attivo con stato completo).
2. Verifica che `v2NewCounter > 0` (modificato nel test 7.1).
3. `upgrades.upgradeProxy(proxy, TokenV3, { call: { fn: 'initializeV3', args: [] } })`.
4. **Verifiche:**
   - Lo stato V1 + V2 è integralmente invariato (incluso `v2NewCounter`, che però ora non si può più incrementare).
   - `incrementV2Counter()` ora fa revert con `DeprecatedV2Counter`.
   - `setMaxTransferAmount(1000e18)` funziona da `FEE_ADMIN_ROLE`.
   - Un transfer di valore superiore a `maxTransferAmount` fa revert.
   - Il plugin OZ Upgrades non emette warning di `Storage layout incompatibility` durante `validateUpgrade(V2, V3)`.

### 7.3 Test storage layout (`storage.layout.spec.ts`)

Verifica programmatica che:

- Lo slot ERC-7201 di ogni modulo (`FEE_STORAGE_LOCATION`, `FREEZABLE_STORAGE_LOCATION`, `RESTRICTED_STORAGE_LOCATION`, `EIP3009_STORAGE_LOCATION`, `V2_STORAGE_LOCATION`, `V3_STORAGE_LOCATION`) corrisponda alla formula canonica:
  `keccak256(abi.encode(uint256(keccak256("<namespace>")) - 1)) & ~bytes32(uint256(0xff))`.
- Gli slot dei vari moduli sono **tutti diversi** tra loro (no collisioni).
- `validateUpgrade(V1, V2)` e `validateUpgrade(V2, V3)` non producono errori.

---

## 8. Logica della Fee — dettaglio implementativo

> **🐛 Bug del precedente design (identificato in review):** la fee veniva descritta come applicata in `_update` senza specificare il comportamento per mint (`from == address(0)`) e burn (`to == address(0)`). Senza la guard:
> - su **mint**, si tenterebbe `super._update(address(0), feeCollector, fee)` → revert `ERC20InsufficientBalance(address(0), 0, fee)` → ogni mint fallisce.
> - su **burn**, si tenterebbe `super._update(from, feeCollector, fee)` + `super._update(from, address(0), value - fee)` → il burn brucia meno del previsto e una parte finisce al feeCollector (comportamento silenziosamente errato).
>
> La specifica corretta sotto risolve entrambi i casi e aggiunge il **short-circuit su `_fee == 0`** per risparmiare gas.

### 8.1 Pseudocodice canonico di `_update`

```solidity
function _update(address from, address to, uint256 value)
    internal
    override(ERC20Upgradeable, ERC20PausableUpgradeable)
{
    // 1) BLOCK CHECK: nessun trasferimento da/verso indirizzi bloccati
    //    (vale anche per mint e burn — non si può mintare verso un blocked
    //     né bruciare da un blocked, altrimenti il blocco è aggirabile)
    if (_isBlocked(from) || _isBlocked(to)) revert AccountBlocked();

    // 2) FREEZE CHECK: il saldo non congelato deve coprire il trasferimento
    //    (NON si applica al mint perché from == address(0))
    if (from != address(0)) {
        uint256 frozenAmount = _frozenOf(from);
        if (frozenAmount != 0) {
            uint256 currentBalance = balanceOf(from);
            uint256 unfrozen = currentBalance > frozenAmount
                ? currentBalance - frozenAmount
                : 0;
            if (value > unfrozen) revert InsufficientUnfrozenBalance(value, unfrozen);
        }
    }

    // 3) FEE: applicata solo se tutte queste condizioni sono vere:
    //    - fee > 0          (short-circuit per risparmio gas)
    //    - non è un mint    (from != address(0))
    //    - non è un burn    (to != address(0))
    //    - né from né to sono in whitelist
    uint256 fee_ = _fee();
    if (
        fee_ != 0 &&
        from != address(0) &&
        to != address(0) &&
        !_isFeeFree(from) &&
        !_isFeeFree(to)
    ) {
        uint256 feeAmount = (value * fee_) / 10_000;
        if (feeAmount != 0) {
            // due chiamate distinte a super._update per emettere due eventi Transfer separati
            super._update(from, _feeCollector(), feeAmount);
            super._update(from, to, value - feeAmount);
            return;
        }
    }

    // 4) Caso semplice: trasferimento senza fee (incluso mint e burn)
    super._update(from, to, value);
}
```

### 8.2 Cap on-chain alla fee e eventi (v1.6.3+)

```solidity
uint16 public constant MAX_FEE_BASIS_POINTS = 999; // 9,99% massimo

error FeeExceedsMaximum(uint256 fee, uint256 maxFee);
error InvalidFeeCollector();

function setFee(uint256 newFee) external onlyRole(FEE_ADMIN_ROLE) {
    if (newFee > MAX_FEE_BASIS_POINTS) revert FeeExceedsMaximum(newFee, MAX_FEE_BASIS_POINTS);
    uint256 oldFee = _fee();
    _setFee(newFee);
    emit FeeUpdated(oldFee, newFee);
}

function setFeeCollector(address collector) external onlyRole(FEE_ADMIN_ROLE) {
    if (collector == address(0)) revert InvalidFeeCollector();
    address oldCollector = _feeCollector();
    _setFeeCollector(collector);
    emit FeeCollectorUpdated(oldCollector, collector);
}

function addFeeFree(address account) external onlyRole(FEE_ADMIN_ROLE) {
    _setFeeFree(account, true);
    emit FeeFreeStatusChanged(account, true);
}

function removeFeeFree(address account) external onlyRole(FEE_ADMIN_ROLE) {
    _setFeeFree(account, false);
    emit FeeFreeStatusChanged(account, false);
}
```

**Eventi amministrazione fee (v1.6.3+):**

```solidity
event FeeUpdated(uint256 previousFee, uint256 newFee);
event FeeCollectorUpdated(address indexed previousCollector, address indexed newCollector);
event FeeFreeStatusChanged(address indexed account, bool isFeeFree);
```

### 8.3 Interazioni fee × firme off-chain (DA DOCUMENTARE NEL CONTRATTO)

> **Da inserire come NatSpec dell'intero contratto e nel README**, perché modifica le aspettative di chi firma off-chain.

Quando `fee > 0` e né `from` né `to` sono in `feeFreeList`:

| Funzione | L'utente firma `value` | Il recipient riceve | Note |
|---|---|---|---|
| `transfer(to, value)` | — (non c'è firma) | `value − fee` | comportamento "tasse alla fonte" |
| `transferFrom(from, to, value)` | — | `value − fee` | idem |
| `permit` + `transferFrom` | la signature riguarda solo l'`approve` | `value − fee` sul `transferFrom` successivo | nessuna sorpresa: la firma riguarda l'allowance, non il trasferimento |
| `transferWithAuthorization(from, to, value, …)` | `value` | **`value − fee`** | ⚠️ **scostamento** dal valore firmato |
| `receiveWithAuthorization(from, to, value, …)` | `value` | **`value − fee`** | ⚠️ idem |
| `transferAndCall(to, value, data)` | — | `value − fee` + callback con `value − fee` | la callback riceve il valore netto effettivo |
| `transferFromAndCall(from, to, value, data)` | — | `value − fee` + callback con `value − fee` | idem |

**Decisione di design ERC-1363:** la callback `onTransferReceived` è invocata con il **valore netto** (`value − fee`), perché il recipient deve sapere esattamente quanto ha ricevuto.

**Decisione di design EIP-3009:** firmare un `transferWithAuthorization` quando `fee > 0` produce uno scostamento tra valore firmato e valore ricevuto. **Mitigazione raccomandata** per gli integratori che richiedono importi esatti (gateway di pagamento, exchange, bridge):

> Aggiungere l'indirizzo dell'integratore alla `feeFreeList` (sia come `from` che come `to`, in base al ruolo che svolge). In quel caso `fee == 0` per quei trasferimenti e il valore firmato coincide con il valore ricevuto.

Questo va riportato esplicitamente:
- nel NatSpec del contratto principale,
- nel README,
- nel `@dev` di `transferWithAuthorization` e `receiveWithAuthorization`.

---

## 9. Pausable — matrice di comportamento

Quando il contratto è in `paused == true`, le funzioni si comportano così (best practice OZ v5.6.1, con `ERC20PausableUpgradeable` che fa override di `_update` con `whenNotPaused`):

| Funzione | Bloccata da `pause`? | Note |
|---|:---:|---|
| `transfer`, `transferFrom` | ✅ Sì | passano da `_update` |
| `mint` (solo MINTER) | ✅ Sì | `_update(address(0), to, …)` |
| `burn` (solo BURNER) | ✅ Sì | `_update(from, address(0), …)` |
| `transferAndCall`, `transferFromAndCall` (ERC-1363) | ✅ Sì | passano per `transfer` / `transferFrom` |
| `transferWithAuthorization` (EIP-3009) | ✅ Sì | esegue `_transfer` internamente |
| `receiveWithAuthorization` (EIP-3009) | ✅ Sì | idem |
| `approve` | ❌ No | non muove saldi |
| `permit` (EIP-2612) | ❌ No | solo allowance |
| `approveAndCall` (ERC-1363) | ❌ No | la parte `approve` non è bloccata |
| `cancelAuthorization` (EIP-3009) | ❌ No | annulla solo una firma off-chain |
| `recoverERC20`, `recoverETH`, `recoverERC721` | ❌ No | funzioni di emergenza admin |
| `pause`, `unpause` | ❌ No | meta-funzioni |
| `grantRole`, `revokeRole`, `renounceRole` | ❌ No | gestione ruoli |
| `setFee`, `setFeeCollector`, `add/removeFeeFree` | ❌ No | configurazione |
| `freeze`, `unfreeze`, `freezeAll`, `reduceFrozen` | ❌ No | configurazione utente |
| `blockUser`, `resetUser` | ❌ No | configurazione utente |
| `upgradeToAndCall` | ❌ No | manutenzione critica |
| funzioni `view` (`balanceOf`, `frozenOf`, `isBlocked`, …) | ❌ No | sola lettura |

**Implementazione:** si eredita `ERC20PausableUpgradeable` di OZ 5.6.1, che override `_update` con `whenNotPaused`. Tutte le funzioni che passano da `_update` ereditano automaticamente il blocco. Le funzioni amministrative (recover, role management, configurazione fee/freeze/block, upgrade) restano **sempre** disponibili: questo è critico per gestire incidenti durante una pausa.

---

## 9.5 Fix di Sicurezza Critica (v1.6.3) — EIP-3009 e ERC-1363 bypassavano i controlli

> **⚠️ BUG CRITICO RISOLTO in v1.6.3:**
> 
> In versioni precedenti (≤1.6.2), `transferWithAuthorization` (EIP-3009) e le funzioni ERC-1363 chiamavano `ERC20Upgradeable._update` **direttamente**, bypassando completamente:
> - Il check PAUSE (da `ERC20PausableUpgradeable`)
> - Il check BLOCK (da `ERC20RestrictedUpgradeable`)
> - Il check FREEZE (da `ERC20FreezableUpgradeable`)
>
> **Conseguenza:** un account bloccato o congelato poteva comunque trasferire token via firma off-chain!

### Soluzione implementata (v1.6.3)

Aggiunta funzione helper `_updateWithoutFee` in `Token.sol` che:
1. Esegue tutti i controlli di sicurezza (BLOCK, FREEZE)
2. Chiama `super._update` che include il check PAUSE
3. **Non** applica fee (per rispettare il design EIP-3009/ERC-1363)

```solidity
function _updateWithoutFee(address from, address to, uint256 value) internal {
    // Security checks for transfers (not mint/burn)
    if (from != address(0) && to != address(0)) {
        // BLOCK check
        if (isBlocked(from) || isBlocked(to)) {
            revert AccountBlocked();
        }
        // FREEZE check
        if (isFrozen(from) || isFrozen(to)) {
            revert AccountFrozen();
        }
    }
    // PAUSE check via ERC20Pausable and transfer
    super._update(from, to, value);
}
```

### Funzioni aggiornate

| Funzione | Before (≤1.6.2) | After (v1.6.3+) |
|---|---|---|
| `_executeTransfer` (EIP-3009) | `ERC20Upgradeable._update` (no checks) | `_updateWithoutFee` (with checks) |
| `_transfer1363` (ERC-1363) | `ERC20Upgradeable._update` (no checks) | `_updateWithoutFee` (with checks) |

**NOTA:** Le funzioni EIP-3009 e ERC-1363 **bypassano ancora le fee** (per design), ma **NON bypassano più i controlli di sicurezza**.

---

## 10. Storage layout — ERC-7201 Namespaced Storage

> **Decisione architetturale:** poiché tutti i moduli upgradeable di OZ v5 usano **già** ERC-7201, non servono `__gap` per i moduli ereditati. Le variabili custom (Fee, Freezable, Restricted, EIP-3009) devono usare **lo stesso pattern** per coerenza e sicurezza.

### 10.1 Pattern di riferimento

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

abstract contract ERC20FeeUpgradeable is Initializable, ERC20Upgradeable {

    /// @custom:storage-location erc7201:advanced.token.fee
    struct FeeStorage {
        uint256 fee;                              // basis points (0–999)
        address feeCollector;
        mapping(address => bool) isFeeFree;
    }

    // keccak256(abi.encode(uint256(keccak256("advanced.token.fee")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant FEE_STORAGE_LOCATION =
        0x...; // valore hardcoded calcolato a build-time

    function _getFeeStorage() private pure returns (FeeStorage storage $) {
        assembly { $.slot := FEE_STORAGE_LOCATION }
    }

    function _fee() internal view returns (uint256) { return _getFeeStorage().fee; }
    function _feeCollector() internal view returns (address) { return _getFeeStorage().feeCollector; }
    function _isFeeFree(address a) internal view returns (bool) { return _getFeeStorage().isFeeFree[a]; }

    function _setFee(uint256 newFee) internal { _getFeeStorage().fee = newFee; }
    // ... altri setter
}
```

### 10.2 Namespace assegnati

| Modulo | Namespace string | Costante in codice |
|---|---|---|
| Fee | `advanced.token.fee` | `FEE_STORAGE_LOCATION` |
| Freezable | `advanced.token.freezable` | `FREEZABLE_STORAGE_LOCATION` |
| Restricted | `advanced.token.restricted` | `RESTRICTED_STORAGE_LOCATION` |
| EIP-3009 | `advanced.token.eip3009` | `EIP3009_STORAGE_LOCATION` |
| V2 (test upgrade) | `advanced.token.v2` | `V2_STORAGE_LOCATION` |
| V3 (test upgrade) | `advanced.token.v3` | `V3_STORAGE_LOCATION` |

### 10.3 Niente `__gap`

**Non aggiungere** `uint256[200] private __gap` né nel contratto principale né nei moduli custom: con namespaced storage ogni modulo ha il proprio slot indipendente derivato da hash e **non può collidere** con quelli degli altri moduli.

L'eventuale aggiunta di campi a una `struct` di namespaced storage è sicura purché i campi nuovi si **aggiungano in fondo** e non si rinominino/riordinino quelli esistenti. Il plugin `@openzeppelin/hardhat-upgrades` lo verifica automaticamente durante `upgradeProxy`.

---

## 11. Moduli Freezable e Restricted — reimplementazione custom

Poiché `@openzeppelin/community-contracts` **non fa parte della libreria auditata** (è un repository sperimentale per iterazione rapida), reimplementiamo questi due moduli inline secondo la spec seguente.

### 11.1 `ERC20FreezableUpgradeable`

**Scopo:** consentire a un ruolo dedicato (`FREEZER_ROLE`) di congelare una parte o la totalità del saldo di un indirizzo, impedendone il trasferimento **senza distruggere** i token.

**Storage** (ERC-7201 namespace `advanced.token.freezable`):

```solidity
struct FreezableStorage {
    mapping(address => uint256) frozen;  // quantità congelata per address
}
```

**Attributi pubblici (view methods):**

| Metodo | Visibility | Ruolo richiesto | Descrizione |
|---|---|---|---|
| `frozenOf(address account)` | `external view` | — (pubblico) | Quantità di token congelati su `account`. Se uguale a `type(uint256).max`, l'indirizzo è "frozen all". |
| `availableBalanceOf(address account)` | `external view` | — | Restituisce `balanceOf(account) − frozenOf(account)`, con clamping a 0 se sottrazione negativa. |

**Metodi di scrittura:**

| Metodo | Visibility | Ruolo richiesto | Effetto |
|---|---|---|---|
| `freeze(address account, uint256 amount)` | `external` | `FREEZER_ROLE` | Imposta `frozen[account] = amount` (overwrite, NON cumulativo). |
| `freezeAll(address account)` | `external` | `FREEZER_ROLE` | Imposta `frozen[account] = type(uint256).max` (qualsiasi trasferimento dell'account fa revert). |
| `unfreeze(address account)` | `external` | `FREEZER_ROLE` | Imposta `frozen[account] = 0`. |
| `reduceFrozen(address account, uint256 amount)` | `external` | `FREEZER_ROLE` | Decrementa `frozen[account]` di `amount`. Revert se underflow. |

**Eventi (v1.6.3+):**

```solidity
event Frozen(address indexed account);
event Unfrozen(address indexed account);
event FrozenAmountChanged(address indexed account, uint256 previousAmount, uint256 newAmount);
```

**Note:** `FrozenAmountChanged` è emesso da tutte le operazioni di freeze/unfreeze/reduceFrozen con i valori before/after.

**Errori custom:**

```solidity
error InsufficientUnfrozenBalance(uint256 requested, uint256 available);
```

**Hook integrato in `_update` (sezione 8.1, step 2):**

- Se `from != address(0)` (non mint) e `frozen[from] != 0`, la quantità trasferibile è `balanceOf(from) − frozen[from]`. Trasferimenti che superano questa soglia fanno revert con `InsufficientUnfrozenBalance`.
- **Mint** non è soggetto al check (è esente per costruzione, `from == 0`).
- **Burn** non è soggetto al check sul lato `to` (`to == 0`), e in base alla scelta architetturale (sezione 12 e 11.1, ultima nota) il `BURNER_ROLE` **può** bruciare token congelati.

**Note di sicurezza e separazione poteri:**

- Il `BURNER_ROLE` può bruciare anche token congelati. Questo è **intenzionale** ed è il pattern "stablecoin standard": freeze del sospetto → indagine → burn dopo conferma. Il `FREEZER_ROLE` da solo non può prelevare i token: serve sempre il `BURNER_ROLE`.

### 11.2 `ERC20RestrictedUpgradeable`

**Scopo:** consentire a un ruolo dedicato (`BLOCKER_ROLE`) di bloccare un indirizzo, impedendogli **sia** di inviare **sia** di ricevere token.

**Storage** (ERC-7201 namespace `advanced.token.restricted`):

```solidity
struct RestrictedStorage {
    mapping(address => bool) blocked;
}
```

**Attributi pubblici (view methods):**

| Metodo | Visibility | Ruolo | Descrizione |
|---|---|---|---|
| `isBlocked(address account)` | `external view` | — | True se l'indirizzo è bloccato. |

**Metodi di scrittura:**

| Metodo | Visibility | Ruolo richiesto | Effetto |
|---|---|---|---|
| `blockUser(address account)` | `external` | `BLOCKER_ROLE` | `blocked[account] = true` |
| `resetUser(address account)` | `external` | `BLOCKER_ROLE` | `blocked[account] = false` |

**Eventi (v1.6.3+):**

```solidity
event Blocked(address indexed account);
event Unblocked(address indexed account);
```

**Errori custom:**

```solidity
error AccountBlocked();
```

**Note:** In v1.6.3 `AddressBlocked` è stato rimosso (era duplicato), ora si usa solo `AccountBlocked`.

**Hook integrato in `_update` (sezione 8.1, step 1):**

- Se `blocked[from] == true` **OPPURE** `blocked[to] == true` → revert con `AddressBlocked()`.
- **Vale anche per mint e burn:** non si può mintare verso un indirizzo bloccato (per evitare aggiramenti via airdrop) né bruciare da un indirizzo bloccato (per evitare aggiramenti via "burn coordinato").

### 11.3 Ordine canonico dei controlli in `_update`

L'ordine **obbligatorio** nel contratto finale è:

1. **Pause** — gestito dal modifier `whenNotPaused` che `ERC20PausableUpgradeable` mette sul proprio override di `_update`.
2. **Block** — revert immediato se `from` o `to` bloccati (incluso mint/burn).
3. **Freeze** — revert se saldo non congelato insufficiente (escluso mint).
4. **Fee** — calcolo e split (escluso mint/burn, escluso whitelist, escluso `fee == 0`).
5. **Settlement** — chiamata finale a `super._update`.

---

## 12. Matrice ruoli × azioni (versione corretta — Opzione B)

> **Decisione architetturale (Opzione B):**
>
> 1. In `initialize()` il deployer riceve `DEFAULT_ADMIN_ROLE`.
> 2. Lo script di deploy chiama `grantRole(R, X)` per ciascun ruolo `R` verso l'indirizzo `X` configurato in `.env`.
> 3. Il deployer **conserva** `DEFAULT_ADMIN_ROLE` (per gestire futuri grant/revoke) ma **NON riceve** gli altri ruoli — non li userà mai direttamente.
> 4. Eccezione esplicita: i ruoli `FEE_ADMIN_ROLE` e `RECOVERER_ROLE` sono **assegnati direttamente** all'indirizzo del DEFAULT_ADMIN (vedi sezione 3.6), quindi il wallet del deployer **può** eseguire quelle azioni — ma in quanto detentore aggiuntivo di quei ruoli, non in quanto `DEFAULT_ADMIN_ROLE`.
>
> Conseguenza: `DEFAULT_ADMIN_ROLE` da solo **non** consente mint, burn, pause, freeze, ecc. Può solo concedere/revocare ruoli. Questo è il pattern OZ standard e l'unico coerente con `AccessControl.onlyRole`.

| Ruolo ↓ / Azione → | Mint | Burn | Pause | Unpause | Freeze | Unfreeze | Block | Reset | Set Fee | Fee Collector | Add FeeFree | Rm FeeFree | Upgrade | Recover |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`DEFAULT_ADMIN_ROLE`** | | | | | | | | | | | | | | |
| **`MINTER_ROLE`** | X | | | | | | | | | | | | | |
| **`BURNER_ROLE`** | | X | | | | | | | | | | | | |
| **`PAUSER_ROLE`** | | | X | X | | | | | | | | | | |
| **`FREEZER_ROLE`** | | | | | X | X | | | | | | | | |
| **`BLOCKER_ROLE`** | | | | | | | X | X | | | | | | |
| **`FEE_ADMIN_ROLE`** | | | | | | | | | X | X | X | X | | |
| **`UPGRADER_ROLE`** | | | | | | | | | | | | | X | |
| **`RECOVERER_ROLE`** | | | | | | | | | | | | | | X |

**Potere implicito di `DEFAULT_ADMIN_ROLE`** (non rappresentato in matrice):

- `grantRole(role, account)` per qualsiasi ruolo
- `revokeRole(role, account)` per qualsiasi ruolo
- (No `_setRoleAdmin` esposto: il ruolo admin di ogni ruolo è fisso a `DEFAULT_ADMIN_ROLE`)

Su mainnet questo potere sarà mediato da `TimelockController` (sezione 3.7).

**Nuovo ruolo `RECOVERER_ROLE`** introdotto rispetto alla spec originale per coerenza con il principio di separazione dei poteri (recovery di token/ETH/NFT era impropriamente sotto `DEFAULT_ADMIN_ROLE`).

---

## 13. EIP-2612 + EIP-3009 — entrambi implementati

**Decisione:** implementiamo **entrambi** gli standard di firma off-chain.

**Razionale:**

- **EIP-2612 (Permit):** ampiamente supportato dai wallet (MetaMask, Rabby, mobile wallets). Standard de facto per l'integrazione con DEX e bridge. Usa nonce sequenziali. Autorizza un `spender` su un'`allowance` (richiede comunque una chiamata successiva a `transferFrom`).
- **EIP-3009 (Transfer With Authorization):** trasferimenti diretti firmati off-chain, con nonce arbitrari (32 byte casuali) e replay protection. Usato da USDC e PYUSD per pagamenti gasless tramite relayer. Espone anche `cancelAuthorization` e `receiveWithAuthorization` (dove il `to` paga il gas del trasferimento da `from`).

I due meccanismi sono **complementari** e usano **due namespace di nonce separati**:

- EIP-2612: nonce sequenziali per indirizzo (`uint256`), ereditati da `ERC20PermitUpgradeable`.
- EIP-3009: mapping `(address => bytes32 => bool)` per `authorizationState`, namespaced storage `advanced.token.eip3009`.

**Implementazione:**

- Permit: si eredita direttamente `ERC20PermitUpgradeable` di OZ 5.6.1 (include anche EIP-712 ed EIP-5267 `eip712Domain()`).
- EIP-3009: reimplementato come modulo custom `ERC20EIP3009Upgradeable`, dato che OZ non ne offre uno ufficiale. Usa l'`EIP712Upgradeable` come base per la firma e namespace storage dedicato:

```solidity
struct EIP3009Storage {
    mapping(address authorizer => mapping(bytes32 nonce => bool used)) authorizationState;
}
```

**Eventi richiesti dallo standard EIP-3009:**

```solidity
event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);
```

**TypeHash da implementare:**

- `TRANSFER_WITH_AUTHORIZATION_TYPEHASH`
- `RECEIVE_WITH_AUTHORIZATION_TYPEHASH`
- `CANCEL_AUTHORIZATION_TYPEHASH`

(vedi specifica EIP-3009 ufficiale per i valori esatti).

---

## 14. Recovery — `ERC20RecoverableUpgradeable`

**Decisione di design:** `recoverERC20` consente di prelevare **qualsiasi** token, incluso il token stesso (`address(this)`). Questo abilita due use case:

1. Recuperare token inviati per errore al proxy (caso comune sui contratti ERC-20).
2. Utilizzare il proxy come **vault delle fee** se `feeCollector == address(proxy)`.

> **Implicazione operativa:** con `feeCollector == address(proxy)`, l'admin può "raccogliere" le fee accumulate chiamando `recoverERC20(address(this), treasury, amount)`. Va documentato nel README.

### 14.1 Metodi

| Metodo | Visibility | Ruolo | Note |
|---|---|---|---|
| `recoverERC20(address token, address to, uint256 amount)` | `external` | `RECOVERER_ROLE` | Trasferisce `amount` di `token` dal proxy a `to`. Ammesso `token == address(this)`. |
| `recoverETH(address payable to, uint256 amount)` | `external` | `RECOVERER_ROLE` | Trasferisce ETH/POL nativo dal proxy via `call`. |
| `recoverERC721(address nft, address to, uint256 tokenId)` | `external` | `RECOVERER_ROLE` | Trasferisce un NFT detenuto dal proxy via `safeTransferFrom`. |

### 14.2 Eventi

```solidity
event ERC20Recovered(address indexed token, address indexed to, uint256 amount);
event ETHRecovered(address indexed to, uint256 amount);
event ERC721Recovered(address indexed nft, address indexed to, uint256 tokenId);
```

### 14.3 `receive() payable` e `IERC721Receiver`

- Il contratto **deve** implementare `receive() external payable {}` per accettare native token (necessario se è anche fee vault).
- **Deve** implementare `IERC721Receiver.onERC721Received` ritornando `IERC721Receiver.onERC721Received.selector`, per poter ricevere NFT inviati via `safeTransferFrom`.

### 14.4 Note sui controlli

- Non c'è guard `whenNotPaused`: il recovery deve funzionare anche in stato di pause (è una funzione di emergenza).
- Non c'è guard di reentrancy: i moduli ERC-20/ERC-721 standard di OZ sono safe; tuttavia, dato che `recoverERC20` chiama `IERC20(token).transfer(...)` su un token arbitrario, considerare l'aggiunta di `ReentrancyGuardUpgradeable` se il modulo verrà esteso.

---

## 15. Configurazione iniziale (`initialize`)

**Firma:**

```solidity
function initialize(
    string memory name_,
    string memory symbol_,
    uint256 initialSupply_,
    address initialHolder_,
    uint256 initialFee_,
    address feeCollector_,
    address defaultAdmin_
) public initializer { ... }
```

**Comportamento:**

1. Chiama tutti gli `__*_init` dei moduli ereditati: `__ERC20_init(name_, symbol_)`, `__ERC20Permit_init(name_)` (che chiama anche `__EIP712_init`), `__ERC20Pausable_init`, `__AccessControl_init`, `__UUPSUpgradeable_init`.
2. Inizializza i moduli custom: `__ERC20Fee_init(initialFee_, feeCollector_)`, `__ERC20Freezable_init`, `__ERC20Restricted_init`, `__ERC20EIP3009_init`, `__ERC20_1363_init`, `__ERC20Recoverable_init`.
3. Assegna `DEFAULT_ADMIN_ROLE` a `defaultAdmin_` (di default = `msg.sender`).
4. Imposta `_fee = initialFee_` con check su `MAX_FEE_BASIS_POINTS` (revert se eccede).
5. Imposta `_feeCollectorAddress = feeCollector_` (revert se `address(0)`).
6. Se `initialSupply_ > 0`, esegue `_mint(initialHolder_, initialSupply_)`. **Il mint dentro `initialize` non richiede `MINTER_ROLE`** perché avviene una sola volta on-deploy: chiama direttamente la funzione interna `_mint`, non il metodo pubblico `mint`.
7. **Nessun altro ruolo viene assegnato in `initialize`:** spetta allo script di deploy chiamare `grantRole` per ciascuno (sezione 4.4).

**Valori di default:**

- `decimals()` ritorna `18` (default OZ, **niente override**).
- `INITIAL_SUPPLY = 10_000 × 1e18` (10.000 token con 18 decimali).
- `INITIAL_HOLDER_ADDRESS = DEFAULT_ADMIN_ADDRESS` (il deployer riceve il supply iniziale).
- `TRANSACTION_FEE_BASIS_POINTS = 10` (0,10%).

**`_authorizeUpgrade`:**

```solidity
function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyRole(UPGRADER_ROLE)
{}
```

**`_disableInitializers()` nel costruttore dell'implementazione:**

```solidity
/// @custom:oz-upgrades-unsafe-allow constructor
constructor() {
    _disableInitializers();
}
```

---

## 16. Regole finali per gli agent

Gli agent devono:

1. **Compilare senza warning** con Solidity 0.8.28 + ottimizzatore standard (`runs: 200`).
2. **Validare** ogni upgrade con `@openzeppelin/hardhat-upgrades` (`validateUpgrade` o `upgradeProxy`).
3. Generare codice **NatSpec-completo** su ogni funzione pubblica/external, su ogni evento custom, su ogni errore custom.
4. **Coprire al 100%** (statements, branches, functions) i moduli custom (Fee, Freezable, Restricted, EIP-3009, Recoverable). Per i moduli ereditati OZ è sufficiente happy path + revert path principale.
5. Rispettare la **separazione critica** dei wallet definita nelle sezioni 3 e 12.
6. **NON** introdurre `__gap` (sezione 10.3): tutta la logica custom usa ERC-7201.
7. **NON** introdurre `upgradeTo(address)` (rimossa in OZ v5, sezione 1).
8. **NON** dipendere da `@openzeppelin/community-contracts` (sezione 11).
9. **NON** assegnare `MINTER_ROLE`, `BURNER_ROLE`, `PAUSER_ROLE`, `FREEZER_ROLE`, `BLOCKER_ROLE`, `UPGRADER_ROLE` al deployer in `initialize`: lo script di deploy li distribuisce in un secondo step (sezione 4.4).
10. Documentare **esplicitamente** nei NatSpec del contratto le interazioni cross-feature (sezione 8.3): fee × EIP-3009, fee × ERC-1363.
11. Includere nel README:
    - il piano di migrazione mainnet (multisig + timelock, sezione 3.7)
    - la matrice ruoli × azioni (sezione 12)
    - la matrice pause × funzioni (sezione 9)
    - le interazioni fee × firme off-chain (sezione 8.3)
12. Generare un `.env.example` che rispecchi la sezione 3 con valori segnaposto (`0x000…`) e nessuna chiave privata.

---

## Appendice A — Glossario rapido degli standard

| Standard | Cosa fornisce | Modulo OZ usato | Custom? |
|---|---|---|---|
| ERC-20 | Token base | `ERC20Upgradeable` | No |
| ERC-165 | Interface detection | `ERC165Upgradeable` (via ERC-1363) | No |
| ERC-1363 | Payable token con callback | — (custom) | **Sì** (sezione 13) |
| ERC-1822 | UUPS Proxiable | `UUPSUpgradeable` | No |
| ERC-1967 | Storage slot del proxy | `ERC1967Utils` + `ERC1967Proxy` | No |
| ERC-7201 | Namespaced storage | (pattern, non un modulo) | **Sì** (sezione 10) |
| EIP-712 | Typed structured data signing | `EIP712Upgradeable` | No |
| EIP-2612 | Permit (allowance via firma) | `ERC20PermitUpgradeable` | No |
| EIP-3009 | Transfer with Authorization | — (custom) | **Sì** (sezione 13) |
| EIP-5267 | `eip712Domain()` | incluso in `EIP712Upgradeable` v5 | No |
| AccessControl | RBAC con ruoli | `AccessControlUpgradeable` | No |
| Pausable | Stato di pausa globale | `ERC20PausableUpgradeable` | No |

---

## Appendice B — Comandi pnpm

```bash
# Setup
pnpm install

# Compile + genera ABI in abi/
pnpm hardhat compile

# Test
pnpm hardhat test
pnpm hardhat coverage

# Deploy
pnpm hardhat run scripts/deploy/deploy_local.ts --network hardhat
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy
pnpm hardhat run scripts/deploy/deploy_polygon.ts --network polygon

# Upgrade
pnpm hardhat run scripts/upgrade/upgrade_amoy.ts --network amoy

# Verifica
pnpm hardhat run scripts/deploy/verify.ts --network amoy
```

---

**Fine del documento. Procedere con la generazione del codice secondo questa specifica.**
