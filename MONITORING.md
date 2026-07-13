# Monitoring — Token v2.0.0

## Approccio

Dalla v2.0.0 il monitoraggio è interamente **off-chain** (decisione D8, vedi
SPEC_FEE_CUSTODIA.md): lo strato di eventi debug on-chain della v1.x
(`OperationLogged`, `*OperationDebug`, `HealthCheck`, `ErrorReport`) e le funzioni
diagnostiche (`healthCheck()`, `emitHealthCheck()`, `getSystemStatus()`, `isAdmin()`,
`debugRoles()`) sono stati **rimossi**: duplicavano informazioni già derivabili dagli
eventi standard, gonfiavano bytecode e costavano gas a ogni operazione privilegiata.

Tutto ciò che serve per l'osservabilità è negli **eventi standard e di dominio**,
indicizzabili con qualsiasi indexer (The Graph, Ponder, script ethers/viem su
`queryFilter`, Polygonscan API).

## Eventi disponibili

### Standard ERC-20 / OZ
| Evento | Fonte | Uso |
|---|---|---|
| `Transfer(from, to, value)` | ERC20 | movimenti, mint (`from=0`), burn (`to=0`), **enumerazione holder per lo sweep** |
| `Approval(owner, spender, value)` | ERC20 | allowance |
| `Paused(account)` / `Unpaused(account)` | Pausable | stato pausa |
| `RoleGranted/RoleRevoked(role, account, sender)` | AccessControl | audit trail ruoli |
| `Upgraded(implementation)` | ERC-1967 | upgrade UUPS |
| `Initialized(version)` | Initializable | init/reinit |

### Dominio (v2.0.0)
| Evento | Fonte | Uso |
|---|---|---|
| `TransferFeeUpdated(previousBps, newBps)` | TransferFee | governance fee |
| `FeeCollectorUpdated(previous, new)` | TransferFee | governance fee |
| `TransferFeeExemptionChanged(account, exempt)` | TransferFee | whitelist scambio |
| `CustodyFeeUpdated(previousBps, newBps)` | CustodyFee | governance custodia |
| `CustodyTreasuryUpdated(previous, new)` | CustodyFee | governance custodia |
| `CustodyFeeExemptionChanged(account, exempt)` | CustodyFee | whitelist custodia |
| `CycleStarted(cycle, timestamp)` | CustodyFee | apertura ciclo (anche all'init, cycle=1) |
| `CustodyFeeCollected(holder, fee, cycle)` | CustodyFee | **riconciliazione sweep** |
| `Frozen(account)` / `Unfrozen(account)` | Freezable | compliance |
| `Blocked(account)` / `Unblocked(account)` | Blocklist | compliance |
| `AuthorizationUsed/AuthorizationCanceled(authorizer, nonce)` | EIP-3009 | trasferimenti gasless |

## Ricette operative

**Enumerazione holder per lo sweep** (input di `sweepCustodyFee`): indicizzare tutti i
`Transfer` e mantenere il set degli indirizzi con balance > 0. Verifica di completezza
del ciclo N: per ogni holder H del set, `lastSweptCycle(H) == N` oppure H è exempt
(`isCustodyFeeExempt(H)`), holder == treasury, o balance*bps < 10000 (fee 0, comunque
marcato).

**Riconciliazione custodia del ciclo N**: somma dei `CustodyFeeCollected(_, fee, N)` ==
delta balance della treasury nel periodo (al netto di altri movimenti).

**Stato di salute** (sostituisce `getSystemStatus()`): letture view batch via multicall —
`totalSupply()`, `paused()`, `transferFeeBps()`, `feeCollector()`, `custodyFeeBps()`,
`custodyTreasury()`, `currentCycle()`, `version()`.

**Audit ruoli** (sostituisce `debugRoles()`): `hasRole(role, account)` per la matrice in
`roles.md`, o ricostruzione storica da `RoleGranted`/`RoleRevoked`.

## Alert consigliati

1. `Paused` fuori da una finestra di sweep pianificata
2. `RoleGranted`/`RoleRevoked` su qualunque ruolo (specie DEFAULT_ADMIN/UPGRADER)
3. `Upgraded` (qualsiasi upgrade dell'implementation)
4. `TransferFeeUpdated`/`CustodyFeeUpdated`/`FeeCollectorUpdated`/`CustodyTreasuryUpdated`
5. `CycleStarted` non seguito dal completamento dello sweep entro la finestra operativa
6. Transfer di taglia anomala da/verso `feeCollector` o `custodyTreasury`
