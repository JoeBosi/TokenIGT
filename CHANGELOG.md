# Changelog

All notable changes to the IGE Token project.

## [1.6.3-security-fixes] - 2025-05-18

### Security (Critical)
- **CRITICAL FIX**: EIP-3009 and ERC-1363 now respect PAUSE/BLOCK/FREEZE restrictions
  - Added `_updateWithoutFee()` helper function for secure transfers without fees
  - Previously, authorized transfers could bypass all security checks
  - Now all transfers (even gasless/fee-less) must pass security validation

### Added (Observability)
- `FrozenAmountChanged` event in `ERC20FreezableUpgradeable`
  - Emitted in: `freeze()`, `freezeAll()`, `unfreeze()`, `reduceFrozen()`
  - Tracks previous and new frozen amounts
- `FeeUpdated` event in `ERC20FeeUpgradeable` (tracks previous/new fee)
- `FeeCollectorUpdated` event (tracks previous/new collector)
- `FeeFreeStatusChanged` event (tracks whitelist changes)
- `AuthorizationCanceled` event for EIP-3009 cancelAuthorization

### Fixed
- **recoverERC721**: Using `safeTransferFrom` instead of decoding bool from `transferFrom`
- **AddressBlocked error**: Removed duplicate error, using only `AccountBlocked`
- **Dead code**: Removed unused `_beforeTokenTransfer` hooks from extensions

### Changed
- Version consolidated to `1.6.3-security-fixes`
- All 9 security/observability points addressed

### Deployment
- **Amoy Proxy:** `0x55F7DaBE49cc7947D6ac12014Af40305176581eB`
- **Implementation:** `0xeD7741db36Cf22e9D339A48e767313f33EFAb360`
- **Status:** All 162 local tests + 9/9 Amoy tests passing (100%)
- **Upgrade:** V1 → V2 tested and working

## [1.6.2-cleanup-final] - 2025-05-18

**⚠️ DEPRECATED:** This version has security issues (EIP-3009/ERC-1363 bypass PAUSE/BLOCK/FREEZE). Use v1.6.3.

### Added
- Comprehensive monitoring system with 9 debug events
- Health check functions (`healthCheck()`, `getSystemStatus()`, `emitHealthCheck()`)
- Role debug utilities (`debugRoles()`, `isAdmin()`)
- Operation tracking with unique operation IDs

### Fixed
- **Critical Fee Bug**: Fixed collector losing tokens when sender is also collector
- **EIP-3009 Fee Issue**: Bypass fee logic for authorized transfers
- **Mint/Burn Test Issues**: Added missing `await tx.wait()` in tests
- **Freeze Function Ambiguity**: Use explicit function signature `freeze(address,uint256)`

### Changed
- Renamed `block()` to `blockAddress()` to avoid shadowing
- Updated version string to `1.6.2-cleanup-final`
- Removed dead code (unused hooks, redundant functions)
- Consolidated version indicator functions

### Deployment
- **Amoy Proxy:** `0x0A06Bad41D08c4634a05a45b8709A32552B1A0ab`
- **Implementation:** `0xaf5c904Aab2dd9A30BF5a76b9913cBafdF218BFf`
- **Status:** All 9/9 tests passing (100%)

## [1.6.1-fee-bug-fixed] - 2025-05-18

### Fixed
- Fee calculation when collector is sender
- Added check: only transfer fee if collector != from

## [1.6.0-monitoring-enabled] - 2025-05-18

### Added
- Initial monitoring system implementation
- Debug events for all core operations
- Error reporting events

## [1.5.0] - 2025-05-17

### Fixed
- Final fee bug fix with comprehensive testing

## [1.4.0] - 2025-05-17

### Fixed
- Fee system logic correction in `_update()`

## [1.0.0-1.3.0] - 2025-05-17

### Initial Development
- Base ERC-20 implementation
- UUPS upgradeability setup
- Role-based access control
- Fee mechanism implementation
- Freeze/Block functionality
- EIP-3009 integration
- ERC-1363 support

---

## Version Format

`MAJOR.MINOR.PATCH-description`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes
- **description**: Short change summary

## Security

### Fixed Issues
| Issue | Version | Severity | Description |
|-------|---------|----------|-------------|
| Fee loss | 1.6.2 | High | Collector lost tokens when also sender |
| Duplicate events | 1.6.2 | Medium | Fee events emitted twice |

### Audited Features
- ✅ UUPS upgrade pattern (OpenZeppelin validated)
- ✅ ERC-7201 namespaced storage
- ✅ Role-based access control
- ✅ Fee cap at 9.99% (999 bps)
- ✅ Reentrancy protection via OpenZeppelin
