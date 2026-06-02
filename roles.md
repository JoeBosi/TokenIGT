# Roles & Methods Matrix

Legenda:
- **✅** = può chiamare il metodo (richiede il ruolo)
- **👁️** = metodo pubblico/view, chiamabile da chiunque (nessun ruolo richiesto)
- **🔑** = richiede firma valida del chiamante (EIP-712), nessun ruolo on-chain
- **—** = non applicabile

---

## Ruoli disponibili

| Ruolo | Costante |
|---|---|
| `DEFAULT_ADMIN_ROLE` | `0x00` (OZ default) |
| `UPGRADER_ROLE` | `keccak256("UPGRADER_ROLE")` |
| `MINTER_ROLE` | `keccak256("MINTER_ROLE")` |
| `BURNER_ROLE` | `keccak256("BURNER_ROLE")` |
| `PAUSER_ROLE` | `keccak256("PAUSER_ROLE")` |
| `FREEZER_ROLE` | `keccak256("FREEZER_ROLE")` |
| `BLOCKER_ROLE` | `keccak256("BLOCKER_ROLE")` |
| `FEE_ADMIN_ROLE` | `keccak256("FEE_ADMIN_ROLE")` |
| `RECOVERER_ROLE` | `keccak256("RECOVERER_ROLE")` |

---

## Matrice Metodi × Ruoli

| Metodo | DEFAULT_ADMIN | UPGRADER | MINTER | BURNER | PAUSER | FREEZER | BLOCKER | FEE_ADMIN | RECOVERER | Chiunque |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **— UUPS UPGRADE —** | | | | | | | | | | |
| `upgradeToAndCall(address, bytes)` | — | ✅ | — | — | — | — | — | — | — | — |
| **— SUPPLY —** | | | | | | | | | | |
| `mint(address, uint256)` | — | — | ✅ | — | — | — | — | — | — | — |
| `burn(address, uint256)` | — | — | — | ✅ | — | — | — | — | — | — |
| **— PAUSE —** | | | | | | | | | | |
| `pause()` | — | — | — | — | ✅ | — | — | — | — | — |
| `unpause()` | — | — | — | — | ✅ | — | — | — | — | — |
| **— FREEZE —** | | | | | | | | | | |
| `freeze(address)` | — | — | — | — | — | ✅ | — | — | — | — |
| `freeze(address, uint256)` | — | — | — | — | — | ✅ | — | — | — | — |
| `freezeAll(address)` | — | — | — | — | — | ✅ | — | — | — | — |
| `unfreeze(address)` | — | — | — | — | — | ✅ | — | — | — | — |
| `reduceFrozen(address, uint256)` | — | — | — | — | — | ✅ | — | — | — | — |
| `frozenOf(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `isFrozen(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `availableBalanceOf(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— BLOCK —** | | | | | | | | | | |
| `blockAddress(address)` | — | — | — | — | — | — | ✅ | — | — | — |
| `unblock(address)` | — | — | — | — | — | — | ✅ | — | — | — |
| `isBlocked(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— FEE —** | | | | | | | | | | |
| `setFee(uint256)` | — | — | — | — | — | — | — | ✅ | — | — |
| `setFeeCollector(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `addFeeFree(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `removeFeeFree(address)` | — | — | — | — | — | — | — | ✅ | — | — |
| `fee()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `feeCollector()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `isFeeFree(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— RECOVERY —** | | | | | | | | | | |
| `recoverERC20(address, address, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverETH(address payable, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| `recoverERC721(address, address, uint256)` | — | — | — | — | — | — | — | — | ✅ | — |
| **— ACCESS CONTROL —** | | | | | | | | | | |
| `grantRole(bytes32, address)` | ✅ | — | — | — | — | — | — | — | — | — |
| `revokeRole(bytes32, address)` | ✅ | — | — | — | — | — | — | — | — | — |
| `renounceRole(bytes32, address)` | — | — | — | — | — | — | — | — | — | 👁️* |
| `hasRole(bytes32, address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `getRoleAdmin(bytes32)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-20 STANDARD —** | | | | | | | | | | |
| `transfer(address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `transferFrom(address, address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `approve(address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `allowance(address, address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `balanceOf(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `totalSupply()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `name()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `symbol()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `decimals()` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-2612 PERMIT —** | | | | | | | | | | |
| `permit(address, address, uint256, uint256, uint8, bytes32, bytes32)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `nonces(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `DOMAIN_SEPARATOR()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `eip712Domain()` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— EIP-3009 TRANSFER WITH AUTHORIZATION —** | | | | | | | | | | |
| `transferWithAuthorization(...)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `receiveWithAuthorization(...)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `cancelAuthorization(address, bytes32, uint8, bytes32, bytes32)` | — | — | — | — | — | — | — | — | — | 🔑 |
| `authorizationState(address, bytes32)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— ERC-1363 PAYABLE TOKEN —** | | | | | | | | | | |
| `transferAndCall(address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `transferAndCall(address, uint256, bytes)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `transferFromAndCall(address, address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `transferFromAndCall(address, address, uint256, bytes)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `approveAndCall(address, uint256)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `approveAndCall(address, uint256, bytes)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `supportsInterface(bytes4)` | — | — | — | — | — | — | — | — | — | 👁️ |
| **— MONITORING & DIAGNOSTICS —** | | | | | | | | | | |
| `healthCheck()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `emitHealthCheck()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `getSystemStatus()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `version()` | — | — | — | — | — | — | — | — | — | 👁️ |
| `isAdmin(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `debugRoles(address)` | — | — | — | — | — | — | — | — | — | 👁️ |
| `paused()` | — | — | — | — | — | — | — | — | — | 👁️ |

> \* `renounceRole` è chiamabile solo dall'account stesso che rinuncia al proprio ruolo (non richiede `DEFAULT_ADMIN_ROLE`).

---

## Note sul controllo degli accessi

- **`DEFAULT_ADMIN_ROLE`** è il role admin di tutti gli altri ruoli: può fare `grantRole` e `revokeRole` per qualsiasi ruolo (incluso se stesso, salvo rinuncia).
- **`UPGRADER_ROLE`** autorizza `_authorizeUpgrade` interno che viene chiamato da `upgradeToAndCall` (UUPS).
- I metodi **EIP-3009** e **EIP-2612 Permit** non richiedono ruoli: la sicurezza è garantita dalla firma ECDSA off-chain dell'owner dei token.
- I metodi **ERC-1363** (`transferAndCall`, `transferFromAndCall`, `approveAndCall`) sono aperti a chiunque ma soggetti alle stesse restrizioni di `transfer`/`approve` (pause, freeze, block, fee).
- Le funzioni di monitoring (`healthCheck`, `getSystemStatus`, ecc.) sono tutte `view` e pubbliche, nessun ruolo richiesto.
