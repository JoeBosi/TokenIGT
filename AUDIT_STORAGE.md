# Audit del layout di storage — Token v2.3.0

> Data: 2026-07-07 · Scopo: valutare la progettazione dello storage del contratto
> upgradeable (UUPS), individuare problemi e limiti. Metodo: analisi statica di
> tutti gli struct namespaced ERC-7201, del packing, dell'unicità dei namespace,
> delle variabili di stato e delle regole di upgrade.

## Verdetto

**Progettazione solida e corretta. Nessun bug di storage, nessun rischio di
collisione.** Il contratto adotta in modo coerente il pattern ERC-7201 (namespaced
storage), che è lo stato dell'arte per gli upgradeable. Le **2 osservazioni di
consistenza** emerse (mock non-namespaced, script legacy) sono state **risolte il
2026-07-07** (§3). Restano solo i **limiti intrinseci del pattern** (§4), da
conoscere e rispettare. Dettaglio sotto.

---

## 1. Come è progettato lo storage

- **Nessuna variabile di stato "plain"** in `Token.sol`: solo costanti (`*_ROLE`,
  `MAX_*_BPS`), che non occupano storage. → gli slot sequenziali 0,1,2… sono **liberi**.
- **Tutto lo stato mutabile vive in namespace ERC-7201**, uno per modulo:

  | Namespace | Modulo | Contenuto (ordine dei campi) |
  |---|---|---|
  | `advanced.token.transferfee.storage` | TransferFee | `uint16 bps` + `address collector` (packed slot 0) · `EnumerableSet exempt` |
  | `advanced.token.custodyfee.storage` | Custody | `uint16 bps` + `address treasury` (packed slot 0) · `uint256 currentCycle` · `mapping lastSweptCycle` · `EnumerableSet exempt` |
  | `advanced.token.freezable.storage` | Freezable | `mapping(address⇒bool) frozen` |
  | `advanced.token.blocklist.storage` | Blocklist | `mapping(address⇒bool) blocked` |
  | `advanced.token.eip3009.storage` | EIP-3009 | `mapping(address⇒mapping(bytes32⇒bool)) authorizationState` |

- **Le basi OpenZeppelin 5.x sono anch'esse namespaced** (`openzeppelin.storage.ERC20`,
  `.ERC20Permit`, `.Pausable`, `.AccessControl`, `.Initializable`, `.ERC165`,
  `.Nonces`, `.EIP712`). Nessuna base usa storage sequenziale.
- **Nessun `__gap`** (corretto: superfluo col namespacing).
- **Slot precomputati** come costanti letterali, con la formula ERC-7201 completa
  nel commento `@dev` e l'annotazione `@custom:storage-location` sullo struct.
- **Validazione**: gli script usano `upgrades.deployProxy`/`upgradeProxy` del plugin
  OZ, che valida il namespaced layout leggendo le annotazioni.
- **Guardiano**: `TokenStorageLayoutTest.t.sol` verifica **on-chain** (via `vm.load`)
  che ogni slot dichiarato sia quello usato, e che le 5 costanti coincidano con la
  formula applicata al namespace string.

## 2. Punti di forza (perché è robusto)

1. **Nessuna collisione possibile** tra moduli: ogni namespace è un hash keccak256 di
   una stringa distinta → slot distanti ~2²⁵⁶, collisione praticamente impossibile.
2. **Ordine di ereditarietà irrilevante per lo storage**: essendo tutto namespaced,
   si potrebbe perfino riordinare la lista dei contratti base senza spostare un solo
   byte. (Col vecchio pattern `__gap` l'ordine è critico — qui no.)
3. **AccessControl ereditato da più moduli** (diamond) risolve a **un'unica** area di
   storage namespaced condivisa: nessuna duplicazione, nessun doppio-init
   (`__AccessControl_init` chiamato una sola volta in `initialize`).
4. **Packing efficiente e sicuro**: `uint16 bps` + `address` (22 byte) stanno in un
   solo slot; verificato byte-per-byte dai test.
5. **`FeeManagerRole`** dichiara `FEE_MANAGER_ROLE` una sola volta (base stateless
   condivisa) evitando il clash di identificatori tra i due moduli fee.

## 3. Osservazioni — RISOLTE (2026-07-07)

### O1 — I mock V2/V3 ora usano storage NAMESPACED ✅
`TokenV2.sol` e `TokenV3.sol` sono stati riscritti per usare il pattern ERC-7201
come i moduli di produzione: namespace dedicati `advanced.token.v2test.storage`
(slot `0x4e5b…1f00`) e `advanced.token.v3test.storage` (slot `0xb721…ba00`),
con struct annotato `@custom:storage-location` e accesso via assembly. Niente più
variabili plain / slot sequenziali. I mock ora **dimostrano il pattern corretto**
per un V2/V3 reale: nessuna dipendenza dall'ordine degli slot, nessun rischio di
collisione tra V2 e V3. I 15 test di upgrade (forward/compatibility/comprehensive)
restano verdi → lo stato è preservato attraverso gli upgrade con storage namespaced.

### O2 — Script di upgrade legacy rimossi ✅
I 5 script one-off dell'era v1 (`upgrade_amoy_fee_fix`, `upgrade_amoy_fix`,
`upgrade_amoy_comprehensive_fix`, `upgrade_amoy_fee_bug_fix`, `upgrade_amoy_v2`)
erano già presenti in `scripts/archive/`: rimossi i duplicati da `scripts/upgrade/`,
che ora contiene solo i tre script canonici (`upgrade_local`, `upgrade_amoy`,
`upgrade_polygon`).

## 4. Limiti INTRINSECI del pattern (da conoscere e rispettare)

Non sono difetti del contratto, ma vincoli operativi degli upgradeable namespaced:

1. **Append-only sui campi degli struct**: si possono SOLO aggiungere campi **in
   fondo** a uno struct esistente; mai riordinare, rinominare-con-cambio-tipo, o
   rimuovere campi esistenti. In particolare i campi vanno aggiunti **dopo** gli
   `EnumerableSet`/`mapping` finali (che occupano 2 / 1 slot fissi + dati a slot
   hashati). Violarlo corrompe lo stato.
2. **Slot costanti hardcoded**: se qualcuno modificasse la stringa del namespace ma
   non la costante (o viceversa), lo storage si sposterebbe **in silenzio**. → è il
   motivo per cui esiste il guardiano `TokenStorageLayoutTest`; va mantenuto e
   aggiornato a ogni nuovo namespace.
3. **Ogni nuovo storage deve essere namespaced E annotato** `@custom:storage-location`,
   altrimenti il plugin OZ non lo valida e una variabile plain finirebbe a slot 0 —
   sicura la prima volta, ma una seconda variabile plain a slot 0 in un upgrade
   successivo collide.
4. **`getTransferFeeExemptList()` / `getCustodyFeeExemptList()`** restituiscono
   l'intero array dell'`EnumerableSet`: costo O(n). Per liste di esenzioni (poche
   decine) è irrilevante off-chain; **evitare di chiamarle on-chain** da un altro
   contratto se il set potesse diventare molto grande (rischio out-of-gas). Non è
   un limite dello storage ma dell'accesso.
5. **`lastSweptCycle`** cresce di una entry per ogni holder mai sweepato: crescita
   di storage illimitata nel tempo, ma è inerente e costa 1 slot/holder (economico).

## 5. Dimensionamento dei tipi (nessun problema)
- `currentCycle` è `uint256`: a 1 ciclo/anno non va mai in overflow (né a 1/giorno).
- `transferFeeBps`/`custodyFeeBps` sono `uint16` (max 65.535): sempre sufficienti,
  dato che i basis point massimi concepibili sono 10.000 (100%). I cap on-chain
  (100 / 200) sono ben dentro il tipo.

## 6. Conclusione
Lo storage è **progettato correttamente e in modo difensivo**: namespaced ovunque,
nessuna variabile plain nel contratto principale, nessuna collisione possibile,
packing verificato, validazione OZ + guardiano on-chain. **Nessun problema
bloccante.** Le due osservazioni di consistenza (O1 mock namespaced, O2 script
legacy) sono state **risolte** (§3). Resta da rispettare la **disciplina di upgrade**
(§4), da riportare nel runbook di upgrade quando si preparerà un V2 reale.
