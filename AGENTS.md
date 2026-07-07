# AGENTS.md — Specifica operativa per agenti AI

## Token ERC-20 avanzato — v2.0.0 — OpenZeppelin v5.6.1 (UUPS)

> Documento operativo per lo sviluppo assistito da AI. Documenti correlati:
> `SPEC_FEE_CUSTODIA.md` (spec e decisioni D1–D8), `roles.md` (matrice ruoli×metodi),
> `AUDIT_INTERNO_V2.md` (audit), `MONITORING.md` (osservabilità off-chain),
> `aggiornamento_documenti.md` (checklist di riarmonizzazione documenti).

---

## 1. Stack tecnologico

| Componente | Versione | Note |
|---|---|---|
| Solidity | `^0.8.28` | optimizer ON, `runs: 200`, EVM `cancun` |
| OpenZeppelin Upgradeable | `5.6.1` | UUPS; `upgradeTo(address)` NON esiste in v5: solo `upgradeToAndCall` |
| Hardhat | `^2.22` | test TS + deploy + OZ Upgrades plugin |
| Foundry | ≥1.7 | unit/fuzz/invariant; output in `out/` (SEPARATO da `artifacts/` di Hardhat — non unificarli: i build-info si corrompono a vicenda) |
| TypeScript + ethers v6 | — | script e test |

**Vincolo fondamentale**: `foundry.toml` e `hardhat.config.ts` devono compilare con le
STESSE impostazioni di optimizer — i test devono coprire il bytecode che va on-chain.

---

## 2. Struttura directory

```
contracts/
├── Token.sol                                # Contratto principale (v2.0.0)
├── extensions/
│   ├── FeeManagerRole.sol                   # Costante FEE_MANAGER_ROLE condivisa
│   ├── ERC20TransferFeeUpgradeable.sol      # Fee di scambio (sezione 8)
│   ├── ERC20CustodyFeeUpgradeable.sol       # Fee di custodia a cicli (sezione 8.5)
│   ├── ERC20FreezableUpgradeable.sol        # Freeze binario (sezione 11)
│   ├── ERC20BlocklistUpgradeable.sol        # Blocklist (sezione 11)
│   ├── ERC20EIP3009Upgradeable.sol          # Transfer With Authorization
│   ├── ERC1363PayableUpgradeable.sol        # ERC-1363 custom (sezione 13)
│   └── ERC20RecoverableUpgradeable.sol      # recoverERC20/Native/ERC721 (sezione 14)
├── interfaces/IERC3009.sol                  # (le IERC1363* sono quelle ufficiali OZ)
└── mocks/                                   # TokenV2/V3 (fixture upgrade) + mock ERC20/721/1363

scripts/
├── deploy/{deploy_local,deploy_amoy,deploy_polygon,verify}.ts
├── upgrade/{upgrade_local,upgrade_amoy,upgrade_polygon}.ts
├── roles/{grant_roles,revoke_roles,list_roles}.ts
└── archive/                                 # script one-off storici, NON usare

test/
├── core/        token.{core,roles,pause,supply,metadata}.spec.ts
├── features/    token.{fee,freeze,block,permit,eip5267,erc1363,eip3009,recover,
│                interactions,custody,feesemantics}.spec.ts
├── upgrade/     upgrade.{forward,compatibility,comprehensive}.spec.ts
└── foundry/     Token.t.sol, TokenHandler.sol, UUPSProxy.sol,
                 Token{EIP3009,ERC1363,Recoverable,Misc,CoverageGaps,
                 CustodyFee,FeeSemantics,StorageLayout}Test.t.sol
```

---

## 3. `.env` — ruoli e configurazione

Vedi `.env.example` (sempre allineato). Chiavi principali:

- Rete: `PRIVATE_KEY`, `POLYGONSCAN_API_KEY`, `AMOY_RPC_URL`, `POLYGON_RPC_URL`
- Ruoli: `DEFAULT_ADMIN_ADDRESS`, `UPGRADER_ADDRESS`, `MINTER_ADDRESS`,
  `BURNER_ADDRESS`, `PAUSER_ADDRESS`, `FREEZER_ADDRESS`, `BLOCKER_ADDRESS`,
  `FEE_MANAGER_ADDRESS`, `RECOVERER_ADDRESS`
- Destinatari: `FEE_COLLECTOR_ADDRESS`, `CUSTODY_TREASURY_ADDRESS`, `INITIAL_HOLDER_ADDRESS`
- Config: `TOKEN_NAME`, `TOKEN_SYMBOL`, `INITIAL_SUPPLY`,
  `TRANSFER_FEE_BASIS_POINTS` (cap on-chain **100** = 1%),
  `CUSTODY_FEE_BASIS_POINTS` (cap on-chain **200** = 2%)
- Deploy: `PROXY_ADDRESS`, `IMPLEMENTATION_ADDRESS`

### 3.6 Concentrazione ruoli su testnet
Su Amoy più ruoli condividono wallet per praticità. Su **mainnet** è obbligatorio:
wallet distinti per i ruoli critici, `DEFAULT_ADMIN` e `UPGRADER` su **multisig**
(Safe), valutare timelock e `AccessControlDefaultAdminRulesUpgradeable`
(vedi AUDIT_INTERNO_V2.md, raccomandazione 1).

---

## 4. Deploy

### 4.1 Firma di `initialize` (9 parametri — v2.0.0)

```solidity
initialize(
    string  name_, string symbol_,
    uint256 initialSupply_, address initialHolder_,
    uint256 transferFeeBps_,  address feeCollector_,    // cap 100, collector != 0
    uint256 custodyFeeBps_,   address custodyTreasury_, // cap 200, treasury != 0
    address defaultAdmin_                               // != 0
)
```

`initialize` assegna al `defaultAdmin_` SOLO i ruoli di governance:
`DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`, `FEE_MANAGER_ROLE`, `RECOVERER_ROLE`.
Emette `CycleStarted(1, timestamp)` (il ciclo custodia parte da 1).

### 4.4 Sequenza di deploy (tutte le reti)

1. `upgrades.deployProxy(Token, initArgs, { kind: "uups" })` (validazione OZ inclusa)
2. `scripts/roles/grant_roles.ts` — distribuzione ruoli operativi da `.env`
3. `renounceRole` del deployer sui ruoli che non gli competono
4. Verifica ruoli (`list_roles.ts`) e scrittura `deployments/<rete>/*.json`
5. `verify.ts` per la verifica su Polygonscan
6. Aggiornare `PROXY_ADDRESS`/`IMPLEMENTATION_ADDRESS` in `.env` e la documentazione
   (checklist in `aggiornamento_documenti.md`)

**Il deploy mainnet richiede SEMPRE conferma esplicita dell'utente** e avviene solo
a fine fase di sviluppo/testing, dopo audit esterno.

---

## 6. Test — copertura obbligatoria

- **Target**: ≥95% lines / ≥90% branches sui contratti core (attuale: Token 100%/100%,
  estensioni ≥93,6% lines e 100% branches — residuo = `__init_unchained` vuote)
- Stato attuale: **453 test verdi** (261 Foundry: unit+fuzz+invariant; 192 Hardhat)
- Ogni funzione privilegiata DEVE avere il test "ruolo sbagliato → 
  `AccessControlUnauthorizedAccount`" su entrambe le suite
- Ogni feature nuova: test in ENTRAMBE le suite (Foundry = fuzz/invariant,
  Hardhat = specchio TS + integrazione OZ Upgrades)
- `TokenStorageLayoutTest.t.sol` è il **guardiano anti-regressione ERC-7201**:
  verifica con `vm.load` che gli slot dichiarati siano quelli usati. Se si aggiunge
  un namespace, aggiungere il relativo test
- Invariante fondamentale (TokenHandler): somma balance tracciati == totalSupply
- **Requisito esplicito**: con `transferFeeBps=0` e `custodyFeeBps=0` ogni percorso
  si comporta come ERC-20 puro (matrice fee=0 in TokenFeeSemanticsTest + spec TS)

Trappola nota nei test Foundry: leggere i ruoli (`token.X_ROLE()`) PRIMA di
`vm.prank` — la staticcall consuma il prank.

---

## 7. Upgrade

- Pattern UUPS: `upgradeToAndCall` gated da `UPGRADER_ROLE` via `_authorizeUpgrade`
- `TokenV2`/`TokenV3` in `contracts/mocks/` sono SOLO fixture di test
  (version `2.1.0-test`/`2.2.0-test`)
- Storage: SOLO append nei namespace ERC-7201 esistenti o nuovi namespace; mai
  riordinare; validare sempre con OZ Upgrades
- Prima di ogni upgrade reale: `differential-review` (skill) sul diff dell'implementation

---

## 8. Fee di scambio (transfer fee) — semantica DUPLICE (decisione D4)

Parametri: `transferFeeBps` (0–100, 0 = spenta), `feeCollector` (≠0),
esenzioni `EnumerableSet` (esente se mittente O destinatario è nel set).
Ruolo: `FEE_MANAGER_ROLE`. Fee: `value * bps / 10000` (floor).

### 8.1 Percorso NETTO — `transfer` / `transferFrom`
- mittente −value · destinatario +(value−fee) · collector +fee
- due eventi `Transfer`; allowance consumata per `value`
- infinite allowance (`type(uint256).max`) MAI decrementata
- `collector == from`: la fee resta al mittente, un solo evento
- **POLICY collector** (decisione 2026-07-06): la gamba fee verso il collector
  BYPASSA blocklist/freeze — un collector bloccato/congelato riceve comunque le
  fee. Se revertasse, bloccare il collector paralizzerebbe l'intero token; il
  rimedio a un collector compromesso è `setFeeCollector(nuovo)`, non il blocco
  (che resta utile: gli impedisce di spendere mentre continua ad accumulare).
  Coerente con D3 (treasury). Test guardiani: `test_policy_*` in
  TokenFeeSemanticsTest — non rimuoverli né cambiare il comportamento.

### 8.2 Percorso LORDO — ERC-1363 / EIP-3009
`transferAndCall`, `transferFromAndCall`, `transferWithAuthorization`,
`receiveWithAuthorization`:
- destinatario +value ESATTI · mittente −(value+fee) · collector +fee
- `transferFromAndCall`: l'allowance deve coprire il LORDO (value+fee)
- saldo insufficiente per il lordo → `ERC20InsufficientBalance`
- Nota EIP-3009: la firma copre `value`; la fee applicata è quella corrente
  all'esecuzione (esposizione max +1% per il cap — documentato in AUDIT §2)

### 8.3 View di preview (fee-math pura, assumono parti non-esenti)
- `previewNet(gross)` → netto consegnato da `transfer(gross)`
- `previewGross(net)` → minimo lordo per consegnare ≥ net via `transfer`
- `maxNetTransferable(sender)` → max value spendibile sul percorso lordo
  (= balance se esente o fee 0; = 0 se frozen/blocked)

### 8.5 Fee di custodia (custody fee) — NUOVA in v2.0.0

Parametri: `custodyFeeBps` (0–200), `custodyTreasury` (≠0), `currentCycle` (da 1),
`lastSweptCycle[holder]`, esenzioni EnumerableSet. Tutte le scritture:
`FEE_MANAGER_ROLE` (decisione D2: un solo ruolo).

**Sweep** (`sweepCustodyFee(address[] holders)`):
- fee = `balanceOf(holder) * bps / 10000` calcolata AL MOMENTO → mai insufficienza
- idempotente per ciclo; skip silenzioso per: exempt, già sweepato, treasury, address(0)
- il batch NON reverta mai per un singolo holder; duplicati innocui
- **bypassa pause, transfer fee, blocklist e freeze** (decisione D3: la custodia si
  preleva anche da account bloccati/congelati, e in pausa) via
  `_collectCustodyFee` → `ERC20Upgradeable._update` diretta
- con fee=0 marca il ciclo senza transfer né evento
- procedura anti-elusione: `pause()` → tutti i batch → `unpause()` (lo sweep
  funziona in pausa BY DESIGN); data ciclo (20 marzo) = convenzione off-chain
- holder enumerati off-chain dagli eventi `Transfer` (vedi MONITORING.md)
- eventi: `CycleStarted(cycle, ts)`, `CustodyFeeCollected(holder, fee, cycle)`

---

## 9. Ordine dei controlli e pausa

Percorsi standard (netto e lordo): **BLOCK → FREEZE → FEE → PAUSE (nel settlement) → SETTLEMENT**.
Conseguenza: account blocked + token in pausa ⇒ revert `AccountBlocked` (non `EnforcedPause`).
Mint/burn: nessun controllo block/freeze/fee, solo pausa.
Unica eccezione alla pausa: `sweepCustodyFee` (sezione 8.5).

---

## 10. Storage — ERC-7201 Namespaced

Formula COMPLETA obbligatoria (fix A1, v2.0.0):
```solidity
keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~bytes32(uint256(0xff))
```
Le costanti sono precomputate nei contratti con la formula nel commento `@dev`.

| Namespace | Estensione |
|---|---|
| `advanced.token.transferfee.storage` | ERC20TransferFeeUpgradeable |
| `advanced.token.custodyfee.storage` | ERC20CustodyFeeUpgradeable |
| `advanced.token.freezable.storage` | ERC20FreezableUpgradeable |
| `advanced.token.blocklist.storage` | ERC20BlocklistUpgradeable |
| `advanced.token.eip3009.storage` | ERC20EIP3009Upgradeable |

Niente `__gap` (tutto namespaced). Ogni namespace è verificato on-chain da
`TokenStorageLayoutTest.t.sol`. I namespace v1 (`advanced.token.fee/freezable/
restricted…` senza mask) NON esistono più: la v2 richiede deploy fresco.

---

## 11. Freeze e Blocklist

- **Freeze BINARIO** (decisione D6): `freeze(account)` / `unfreeze(account)` /
  `isFrozen(account)`. Niente importi parziali (rimossi `freeze(addr,amt)`,
  `freezeAll`, `reduceFrozen`, `frozenOf`, `availableBalanceOf`).
- **Blocklist**: `blockAccount` / `unblockAccount` / `isBlocked`, ruolo `BLOCKER_ROLE`.
- Entrambe valgono per mittente E destinatario; enforcement centralizzato in
  `Token._runSecurityChecks`.
- Tutte le funzioni sono **idempotenti**: nessun revert e nessun evento se lo stato
  è già quello richiesto (eventi `Frozen/Unfrozen/Blocked/Unblocked` solo al cambio).

---

## 12. Ruoli

Matrice completa in `roles.md`. Ruoli: `DEFAULT_ADMIN`, `UPGRADER`, `MINTER`,
`BURNER`, `PAUSER`, `FREEZER`, `BLOCKER`, `FEE_MANAGER` (unico per entrambe le fee,
dichiarato in `FeeManagerRole.sol`), `RECOVERER`.

---

## 13. Standard implementati

| Standard | Modulo | Note |
|---|---|---|
| ERC-20 / Pausable / Permit (2612) / 5267 | OZ | — |
| EIP-3009 | custom | settlement LORDO (sezione 8.2) |
| ERC-1363 | custom (`ERC1363PayableUpgradeable`) | interfacce UFFICIALI OZ; implementazione custom necessaria per la semantica lorda |
| ERC-7201 | pattern | sezione 10 |
| UUPS (1822/1967) | OZ | — |

---

## 14. Recovery

`recoverERC20` (SafeERC20 → `SafeERC20FailedOperation` su token non compliant),
`recoverNative` (`NativeTransferFailed` su call fallita), `recoverERC721` (IERC721 tipizzata).
Ruolo `RECOVERER_ROLE`. Nota: `recoverERC20(address(this),…)` passa dal percorso
standard (paga transfer fee e rispetta la pausa) — comportamento documentato e testato.

---

## 16. Regole finali per gli agent

1. Compilare senza warning propri (0.8.28, optimizer 200 runs, cancun) e con
   `forge fmt --check` pulito (CI).
2. **Tutti i 453 test devono passare** (`forge test` + `pnpm test`) prima di ogni commit.
3. Validare ogni upgrade con OZ Upgrades; mai modificare layout esistenti.
4. NatSpec completo su funzioni pubbliche/external, eventi ed errori custom.
5. Moduli custom coperti ≥95% lines / 100% branches.
6. NON assegnare ruoli operativi al deployer in `initialize` (sezione 4.1).
7. NON usare `__gap`; NON usare `upgradeTo` (non esiste in OZ v5).
8. Mai committare segreti; `.env` è gitignored; mai stamparne il contenuto.
9. Dopo ogni modifica seguire `aggiornamento_documenti.md` per riarmonizzare i documenti.
10. Interazioni cross-feature (fee × 3009/1363, sweep × pausa/freeze/block)
    documentate nei NatSpec e coperte da test dedicati.
11. **REGOLA OPERATIVA `renounceRole`**: mai rinunciare a `DEFAULT_ADMIN_ROLE`
    senza un secondo admin già attivo — il lockout della governance è
    irreversibile (nessuno può più fare grant/revoke). Vale per ogni rete.

---

## Appendice B — Comandi

```bash
pnpm install                # setup
pnpm hardhat compile        # compile + typechain
pnpm test                   # 192 test Hardhat
forge test                  # 261 test Foundry (unit+fuzz+invariant)
forge coverage              # coverage core
forge fmt                   # format (CI: forge fmt --check)
forge build --sizes         # check EIP-170
slither .                   # static analysis (config in slither.config.json)

pnpm hardhat run scripts/deploy/deploy_local.ts
pnpm hardhat run scripts/deploy/deploy_amoy.ts --network amoy
pnpm hardhat run scripts/roles/grant_roles.ts --network amoy
pnpm hardhat run scripts/deploy/verify.ts --network amoy
```
