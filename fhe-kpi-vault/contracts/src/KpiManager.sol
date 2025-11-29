// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, ebool, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title KpiManager
/// @notice Manage encrypted KPI submissions and access controls using Zama's fhEVM.
contract KpiManager is ZamaEthereumConfig {
    /// @dev Represents a single encrypted metric entry.
    struct EncryptedMetric {
        uint256 metricId;
        uint64 timestamp;
        euint64 value;
        euint64 note;
    }

    /// @notice Tracks which addresses can administer the contract.
    mapping(address => bool) private admins;

    /// @notice owner => metricId => encrypted metric timeline.
    mapping(address => mapping(uint256 => EncryptedMetric[])) private metrics;

    /// @notice owner => metricId => viewer => whether currently authorized.
    mapping(address => mapping(uint256 => mapping(address => bool))) private metricAccess;

    /// @notice owner => metricId => viewer => whether viewer array already includes the address.
    mapping(address => mapping(uint256 => mapping(address => bool))) private viewerListed;

    /// @notice owner => metricId => ordered list of viewers (may contain revoked viewers).
    mapping(address => mapping(uint256 => address[])) private metricViewers;

    /// @notice wallet authorized to log automated alert triggers (e.g. backend bot).
    address public alertBot;

    uint256 private constant MAX_FUTURE_TIME = 5 minutes;

    event AdminAdded(address indexed account);
    event AdminRemoved(address indexed account);
    event MetricRecorded(address indexed owner, uint256 indexed metricId, uint64 timestamp, uint256 entryIndex);
    event MetricAccessGranted(address indexed owner, uint256 indexed metricId, address indexed viewer);
    event MetricAccessRevoked(address indexed owner, uint256 indexed metricId, address indexed viewer);
    event AlertBotUpdated(address indexed updater, address indexed newAlertBot);
    event InvestorNoteSubmitted(
        address indexed owner,
        uint256 indexed metricId,
        uint256 indexed entryIndex,
        address viewer,
        bytes32 commitment,
        uint64 timestamp
    );
    event InvestorNoteUpdated(
        address indexed owner,
        uint256 indexed metricId,
        uint256 indexed entryIndex,
        address viewer,
        bytes32 commitment,
        uint64 timestamp
    );
    event InvestorNoteDeleted(
        address indexed owner,
        uint256 indexed metricId,
        uint256 indexed entryIndex,
        address viewer,
        bytes32 commitment,
        uint64 timestamp
    );
    event AlertRuleRegistered(address indexed owner, uint256 indexed metricId, bytes32 ruleCommitment, uint64 timestamp);
    event AlertRuleUpdated(
        address indexed owner,
        uint256 indexed metricId,
        bytes32 previousCommitment,
        bytes32 newCommitment,
        uint64 timestamp
    );
    event AlertRuleRemoved(address indexed owner, uint256 indexed metricId, bytes32 ruleCommitment, uint64 timestamp);
    event AlertTriggered(
        address indexed owner,
        uint256 indexed metricId,
        uint256 indexed entryIndex,
        bytes32 ruleCommitment,
        uint64 timestamp,
        address triggeredBy
    );

    modifier onlyAdmin() {
        require(admins[msg.sender], "KpiManager: not admin");
        _;
    }

    constructor() {
        admins[msg.sender] = true;
        emit AdminAdded(msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                ADMINS
    //////////////////////////////////////////////////////////////*/

    function isAdmin(address account) public view returns (bool) {
        return admins[account];
    }

    function addAdmin(address account) external onlyAdmin {
        require(account != address(0), "KpiManager: zero address");
        if (!admins[account]) {
            admins[account] = true;
            emit AdminAdded(account);
        }
    }

    function removeAdmin(address account) external onlyAdmin {
        require(account != address(0), "KpiManager: zero address");
        require(account != msg.sender, "KpiManager: cannot remove self");
        if (admins[account]) {
            admins[account] = false;
            emit AdminRemoved(account);
        }
    }

    function setAlertBot(address newAlertBot) external onlyAdmin {
        alertBot = newAlertBot;
        emit AlertBotUpdated(msg.sender, newAlertBot);
    }

    /*//////////////////////////////////////////////////////////////
                        METRIC RECORDING & ACCESS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Store an encrypted KPI value without an additional note.
     * @param metricId Identifier for the metric stream (e.g. MRR, DAU).
     * @param timestamp Plain Unix timestamp for sequencing on-chain.
     * @param encryptedValue Ciphertext representing the KPI value.
     * @param inputProof ZK proof binding ciphertext inputs.
     */
    function recordMetric(
        uint256 metricId,
        uint64 timestamp,
        externalEuint64 encryptedValue,
        bytes calldata inputProof
    ) external {
        euint64 value = FHE.fromExternal(encryptedValue, inputProof);
        euint64 note = FHE.asEuint64(0);
        _storeMetric(metricId, timestamp, value, note);
    }

    /**
     * @notice Store an encrypted KPI value together with an encrypted note.
     * @param metricId Identifier for the metric stream (e.g. MRR, DAU).
     * @param timestamp Plain Unix timestamp for sequencing on-chain.
     * @param encryptedValue Ciphertext representing the KPI value.
     * @param encryptedNote Ciphertext for an optional note/comment.
     * @param inputProof ZK proof binding ciphertext inputs.
     */
    function recordMetricWithNote(
        uint256 metricId,
        uint64 timestamp,
        externalEuint64 encryptedValue,
        externalEuint64 encryptedNote,
        bytes calldata inputProof
    ) external {
        euint64 value = FHE.fromExternal(encryptedValue, inputProof);
        euint64 note = FHE.fromExternal(encryptedNote, inputProof);
        _storeMetric(metricId, timestamp, value, note);
    }

    /**
     * @notice Grant decryption permission for a metric stream to a viewer.
     */
    function grantAccess(uint256 metricId, address viewer) external {
        require(viewer != address(0), "KpiManager: viewer required");
        require(viewer != msg.sender, "KpiManager: self access implicit");

        if (!viewerListed[msg.sender][metricId][viewer]) {
            viewerListed[msg.sender][metricId][viewer] = true;
            metricViewers[msg.sender][metricId].push(viewer);
        }

        if (!metricAccess[msg.sender][metricId][viewer]) {
            metricAccess[msg.sender][metricId][viewer] = true;
            _propagateViewerPermissions(msg.sender, metricId, viewer);
            emit MetricAccessGranted(msg.sender, metricId, viewer);
        }
    }

    /**
     * @notice Revoke a viewer's decryption permission for a metric stream.
     */
    function revokeAccess(uint256 metricId, address viewer) external {
        require(metricAccess[msg.sender][metricId][viewer], "KpiManager: viewer not authorized");
        metricAccess[msg.sender][metricId][viewer] = false;
        emit MetricAccessRevoked(msg.sender, metricId, viewer);
    }

    /**
     * @notice Returns whether a viewer currently has permission to decrypt a metric stream.
     */
    function hasAccess(address owner, uint256 metricId, address viewer) external view returns (bool) {
        if (viewer == owner) {
            return true;
        }
        return metricAccess[owner][metricId][viewer];
    }

    /**
     * @notice Fetch all encrypted entries for a metric stream.
     */
    function getMetrics(address owner, uint256 metricId) external view returns (EncryptedMetric[] memory) {
        return metrics[owner][metricId];
    }

    /**
     * @notice List the currently authorized viewers for a metric stream.
     */
    function getAuthorizedViewers(address owner, uint256 metricId) external view returns (address[] memory) {
        address[] storage stored = metricViewers[owner][metricId];
        uint256 activeCount;
        uint256 length = stored.length;

        for (uint256 i = 0; i < length; i++) {
            if (metricAccess[owner][metricId][stored[i]]) {
                activeCount++;
            }
        }

        address[] memory viewers = new address[](activeCount);
        uint256 insertIndex;
        for (uint256 i = 0; i < length; i++) {
            address viewer = stored[i];
            if (metricAccess[owner][metricId][viewer]) {
                viewers[insertIndex++] = viewer;
            }
        }
        return viewers;
    }

    /*//////////////////////////////////////////////////////////////
                        INVESTOR FEEDBACK LOGGING
    //////////////////////////////////////////////////////////////*/

    function submitInvestorNote(
        address owner,
        uint256 metricId,
        uint256 entryIndex,
        bytes32 noteCommitment,
        uint64 timestamp
    ) external {
        _validateFeedbackRequest(owner, metricId, entryIndex, msg.sender, noteCommitment);
        emit InvestorNoteSubmitted(owner, metricId, entryIndex, msg.sender, noteCommitment, _sanitizeTimestamp(timestamp));
    }

    function updateInvestorNote(
        address owner,
        uint256 metricId,
        uint256 entryIndex,
        bytes32 noteCommitment,
        uint64 timestamp
    ) external {
        _validateFeedbackRequest(owner, metricId, entryIndex, msg.sender, noteCommitment);
        emit InvestorNoteUpdated(owner, metricId, entryIndex, msg.sender, noteCommitment, _sanitizeTimestamp(timestamp));
    }

    function deleteInvestorNote(
        address owner,
        uint256 metricId,
        uint256 entryIndex,
        bytes32 noteCommitment,
        uint64 timestamp
    ) external {
        _validateFeedbackRequest(owner, metricId, entryIndex, msg.sender, noteCommitment);
        emit InvestorNoteDeleted(owner, metricId, entryIndex, msg.sender, noteCommitment, _sanitizeTimestamp(timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                            ALERT LOGGING
    //////////////////////////////////////////////////////////////*/

    function registerAlertRule(uint256 metricId, bytes32 ruleCommitment, uint64 timestamp) external {
        _validateAlertRuleInput(ruleCommitment);
        emit AlertRuleRegistered(msg.sender, metricId, ruleCommitment, _sanitizeTimestamp(timestamp));
    }

    function updateAlertRule(
        uint256 metricId,
        bytes32 previousCommitment,
        bytes32 newCommitment,
        uint64 timestamp
    ) external {
        _validateAlertRuleInput(previousCommitment);
        _validateAlertRuleInput(newCommitment);
        emit AlertRuleUpdated(
            msg.sender,
            metricId,
            previousCommitment,
            newCommitment,
            _sanitizeTimestamp(timestamp)
        );
    }

    function removeAlertRule(uint256 metricId, bytes32 ruleCommitment, uint64 timestamp) external {
        _validateAlertRuleInput(ruleCommitment);
        emit AlertRuleRemoved(msg.sender, metricId, ruleCommitment, _sanitizeTimestamp(timestamp));
    }

    function logAlertTriggered(
        address owner,
        uint256 metricId,
        uint256 entryIndex,
        bytes32 ruleCommitment,
        uint64 timestamp
    ) external {
        require(msg.sender == owner || msg.sender == alertBot, "KpiManager: not authorized to log");
        _ensureEntryExists(owner, metricId, entryIndex);
        _validateAlertRuleInput(ruleCommitment);
        emit AlertTriggered(
            owner,
            metricId,
            entryIndex,
            ruleCommitment,
            _sanitizeTimestamp(timestamp),
            msg.sender
        );
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _storeMetric(
        uint256 metricId,
        uint64 timestamp,
        euint64 value,
        euint64 note
    ) internal {
        EncryptedMetric memory entry = EncryptedMetric({
            metricId: metricId,
            timestamp: timestamp,
            value: value,
            note: note
        });

        metrics[msg.sender][metricId].push(entry);
        uint256 entryIndex = metrics[msg.sender][metricId].length - 1;
        EncryptedMetric storage stored = metrics[msg.sender][metricId][entryIndex];

        // Grant owner permissions on stored handles.
        FHE.allow(stored.value, msg.sender);
        FHE.allow(stored.note, msg.sender);
        FHE.allowThis(stored.value);
        FHE.allowThis(stored.note);

        // Propagate permissions to all authorized viewers.
        address[] storage viewers = metricViewers[msg.sender][metricId];
        uint256 length = viewers.length;
        for (uint256 i = 0; i < length; i++) {
            address viewer = viewers[i];
            if (metricAccess[msg.sender][metricId][viewer]) {
                FHE.allow(stored.value, viewer);
                FHE.allow(stored.note, viewer);
            }
        }

        emit MetricRecorded(msg.sender, metricId, timestamp, entryIndex);
    }

    function _propagateViewerPermissions(address owner, uint256 metricId, address viewer) internal {
        EncryptedMetric[] storage entries = metrics[owner][metricId];
        uint256 length = entries.length;
        for (uint256 i = 0; i < length; i++) {
            FHE.allow(entries[i].value, viewer);
            FHE.allow(entries[i].note, viewer);
        }
    }

    function _validateFeedbackRequest(
        address owner,
        uint256 metricId,
        uint256 entryIndex,
        address viewer,
        bytes32 noteCommitment
    ) internal view {
        require(owner != address(0), "KpiManager: owner required");
        require(viewer != address(0), "KpiManager: viewer required");
        _ensureEntryExists(owner, metricId, entryIndex);
        require(_viewerHasAccess(owner, metricId, viewer), "KpiManager: viewer lacks access");
        require(noteCommitment != bytes32(0), "KpiManager: commitment required");
    }

    function _viewerHasAccess(address owner, uint256 metricId, address viewer) internal view returns (bool) {
        if (viewer == owner) {
            return true;
        }
        return metricAccess[owner][metricId][viewer];
    }

    function _ensureEntryExists(address owner, uint256 metricId, uint256 entryIndex) internal view {
        require(metrics[owner][metricId].length > entryIndex, "KpiManager: entry missing");
    }

    function _sanitizeTimestamp(uint64 provided) internal view returns (uint64) {
        if (provided == 0) {
            return uint64(block.timestamp);
        }
        require(provided <= block.timestamp + MAX_FUTURE_TIME, "KpiManager: timestamp too far in future");
        return provided;
    }

    function _validateAlertRuleInput(bytes32 ruleCommitment) internal pure {
        require(ruleCommitment != bytes32(0), "KpiManager: rule commitment required");
    }
}
