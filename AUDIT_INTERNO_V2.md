# Audit interno — Token v2.0.0 (branch 2026706ClaudeCode)

> Data: 2026-07-06 · Ambito: contratti v2.0.0 dopo l'implementazione di custody fee,
> doppia semantica transfer fee e pulizia strutturale (decisioni D1–D8 in
> SPEC_FEE_CUSTODIA.md). NON sostituisce l'audit esterno pre-mainnet.

## Metodologia

1. **Slither 0.11.5** su tutto `contracts/` (config in `slither.config.json`)
2. **Coverage Foundry** (`forge coverage`) su contratti core
3. **Review manuale avversariale** dei percorsi critici (checklist sotto)
4. **432 test automatici** (243 Foundry unit/fuzz/invariant + 189 Hardhat), incluse
   suite dedicate a: doppia semantica, sweep custodia, conformità storage ERC-7201
   (verifica on-chain via `vm.load`), matrice fee=0, upgrade V1→V2→V3

## Risultati statici (Slither)

| Severità | Finding | Valutazione |
|---|---|---|
| High | `arbitrary-send-eth` in `recoverNative` (ex `recoverETH`) | **Accettato**: funzione admin gated da `RECOVERER_ROLE`, scopo = recupero fondi inviati per errore |
| Low | `timestamp` in EIP-3009 | **By design**: `validAfter`/`validBefore` sono la semantica dello standard |
| Info | `dead-code`/`naming` su `__X_init_unchained` | **Convenzione OZ**: pattern standard degli initializer upgradeable, presente anche nelle librerie OZ |
| Info | `assembly` nei getter storage | **Necessario**: pattern ERC-7201, identico a OZ |

Rispetto alla v1.x sono spariti: `_spendAllowance` divergente (A2, fixato),
monitoring bloat (D8, rimosso), dead code `_emitTransfer`/`_emitError` (rimossi),
slot ERC-7201 non conformi (A1, fixati e ora coperti da test anti-regressione).

## Coverage (Foundry, core contracts)

| Contratto | Lines | Branches | Note |
|---|---|---|---|
| Token.sol | **100%** | **100%** | |
| CustodyFee | 98,4% | **100%** | residuo = `__init_unchained` vuota |
| EIP3009 | 97,8% | **100%** | idem |
| ERC1363Payable | 97,4% | **100%** | idem |
| TransferFee | 93,6%→ | **100%** | idem + getter list (coperto da test aggiunto) |
| Freezable / Blocklist / Recoverable | ≥93,7% | **100%** | idem |

## Review manuale — checklist verificata

| # | Verifica | Esito |
|---|---|---|
| 1 | Linearizzazione `super._update` in `_grossTransfer` → Pausable → ERC20 (pausa applicata ai percorsi lordi) | ✅ + test |
| 2 | Reentrancy ERC-1363: callback DOPO settlement completo (CEI); allowance spesa prima del transfer | ✅ |
| 3 | `_transferFrom1363`: fee calcolata due volte nella stessa tx senza call esterne intermedie → deterministica | ✅ |
| 4 | Sweep custodia: `lastSweptCycle` marcato PRIMA del transfer; nessuna call esterna nel loop; skip corretti (zero, treasury, exempt, già sweepato) | ✅ + test |
| 5 | `_collectCustodyFee` raggiungibile SOLO da `sweepCustodyFee` (FEE_MANAGER) — bypass pause/fee/block/freeze confinato | ✅ |
| 6 | Fee netta: `fee ≤ value` garantito dal cap 100 bp (nessun underflow) | ✅ + fuzz |
| 7 | Fee lorda: overflow `value + fee` solo per input assurdi → revert checked-arithmetic pulito | ✅ |
| 8 | `previewGross`: divisione sicura (bps ≤ 100 < 10000); minimalità dimostrata via fuzz | ✅ |
| 9 | `maxNetTransferable`: loop di correzione bounded (≤2 iterazioni, dimostrazione nel codice) | ✅ + fuzz |
| 10 | Conservazione: somma balance == totalSupply come invariante stateful (incluso sweep) | ✅ invariant |
| 11 | Infinite allowance non decrementata (semantica OZ ripristinata) | ✅ + test |
| 12 | Storage ERC-7201: formula con mask, slot verificati on-chain con `vm.load`, packing uint16+address confermato | ✅ + test |
| 13 | Upgrade-safety: validazione OZ Upgrades eseguita in ogni `deployProxy` dei test; catena V1→V2→V3 con stato preservato | ✅ + test |
| 14 | `initialize`: validazioni complete (admin≠0, collector≠0, treasury≠0, cap fee) e `_disableInitializers` nel constructor | ✅ + test |
| 15 | Access control: ogni funzione privilegiata gated dal ruolo dedicato; matrice in roles.md; test con ruolo sbagliato per ogni gruppo | ✅ + test |
| 16 | `recoverERC20(address(this))`: passa dal path standard (fee+pausa applicate) — documentato e testato | ✅ |
| 17 | Bytecode: 18.7 KB runtime con optimizer (margine EIP-170 ≈ +5,8 KB) | ✅ |
| 18 | Fee=0 (transfer e custody): tutti i percorsi equivalenti a ERC-20 puro | ✅ matrice test |
| 19 | Ordine revert documentato: BLOCK → FREEZE → PAUSE (block+pausa ⇒ AccountBlocked) | ✅ + doc |

## Note e raccomandazioni residue (pre-mainnet)

1. **Governance** (audit A12, decisione rimandata): `DEFAULT_ADMIN_ROLE` e
   `UPGRADER_ROLE` su multisig (Safe) prima del mainnet; valutare
   `AccessControlDefaultAdminRulesUpgradeable` per il two-step admin transfer.
2. **EIP-3009 e fee variabile**: la firma copre `value`; la fee è quella al momento
   dell'esecuzione. Con cap 1% l'esposizione del firmatario è limitata a +1%
   rispetto al firmato. Documentato; se non accettabile, includere la fee nel
   payload firmato (richiede fork dello standard).
3. **`receiveWithAuthorization` con caller sbagliato** reverta con
   `InvalidSignature` (ereditato da v1): semanticamente sarebbe più chiaro un
   errore dedicato. Cosmetico, ABI-breaking: valutare in una futura minor.
4. **Audit esterno** professionale obbligatorio prima del deploy Polygon mainnet.
