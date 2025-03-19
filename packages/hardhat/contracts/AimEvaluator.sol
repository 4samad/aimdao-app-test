// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import { IAIOracle } from "../lib/OAO/contracts/interfaces/IAIOracle.sol";
import { AIOracleCallbackReceiver } from "../lib/OAO/contracts/AIOracleCallbackReceiver.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Contract that stores a constitution and evaluates proposals against it using AI
contract AimEvaluator is AIOracleCallbackReceiver, Ownable, ReentrancyGuard {
    event ConstitutionUpdated(address updater, uint256 timestamp);
    event ModelSettingsUpdated(uint256 modelId, uint64 gasLimit);
    event ProposalSubmitted(uint256 indexed requestId, address indexed proposer, string proposal);
    event ProposalEvaluated(uint256 indexed requestId, address indexed proposer, string proposal, string result);

    struct ProposalRequest {
        address proposer;
        string proposal;
        string result;
        bool completed;
    }

    // Constitution storage
    string public constitution;
    bool public constitutionSet;

    // Default to Llama model ID
    uint256 public evaluationModelId = 11;
    uint64 public callbackGasLimit = 5_000_000;

    // Track proposal requests
    mapping(uint256 => ProposalRequest) public proposals;

    /// @notice Initialize the contract with the AI Oracle address
    constructor(IAIOracle _aiOracle) AIOracleCallbackReceiver(_aiOracle) Ownable(msg.sender) {
        // Owner is set by Ownable
    }

    /// @notice Set or update the constitution
    function setConstitution(string calldata newConstitution) external onlyOwner {
        require(bytes(newConstitution).length > 0, "Constitution cannot be empty");
        constitution = newConstitution;
        constitutionSet = true;
        emit ConstitutionUpdated(msg.sender, block.timestamp);
    }

    /// @notice Clear the constitution
    function clearConstitution() external onlyOwner {
        constitution = "";
        constitutionSet = false;
        emit ConstitutionUpdated(msg.sender, block.timestamp);
    }

    /// @notice Update model settings
    function updateModelSettings(uint256 modelId, uint64 gasLimit) external onlyOwner {
        require(gasLimit > 0, "Gas limit must be positive");
        evaluationModelId = modelId;
        callbackGasLimit = gasLimit;
        emit ModelSettingsUpdated(modelId, gasLimit);
    }

    /// @notice OAO callback function that processes the AI response
    function aiOracleCallback(
        uint256 requestId,
        bytes calldata output,
        bytes calldata callbackData
    ) external override onlyAIOracleCallback {
        ProposalRequest storage request = proposals[requestId];
        require(request.proposer != address(0), "Request does not exist");

        // Store the result
        request.result = string(output);
        request.completed = true;

        // Emit an event with the evaluation result
        emit ProposalEvaluated(requestId, request.proposer, request.proposal, request.result);
    }

    /// @notice Get the fee estimate for proposal evaluation
    function estimateFee() public view returns (uint256) {
        return aiOracle.estimateFee(evaluationModelId, callbackGasLimit);
    }

    /// @notice Submit a proposal to be evaluated against the constitution
    function evaluateProposal(string calldata proposal) external payable nonReentrant returns (uint256) {
        require(constitutionSet, "Constitution not set");
        require(bytes(proposal).length > 0, "Proposal cannot be empty");

        uint256 fee = estimateFee();
        require(msg.value >= fee, "Insufficient payment");

        // Build the prompt for the AI
        string memory fullPrompt = string(
            abi.encodePacked(
                "You are a constitutional evaluator. Evaluate the following proposal strictly according to this constitution and respond with ONLY 'approved' or 'declined' and nothing else.\n\nCONSTITUTION:\n",
                constitution,
                "\n\nPROPOSAL TO EVALUATE:\n",
                proposal
            )
        );

        // Send request to the AI Oracle
        uint256 requestId = aiOracle.requestCallback{ value: msg.value }(
            evaluationModelId,
            bytes(fullPrompt),
            address(this),
            callbackGasLimit,
            ""
        );

        // Store proposal information
        proposals[requestId] = ProposalRequest({
            proposer: msg.sender,
            proposal: proposal,
            result: "",
            completed: false
        });

        emit ProposalSubmitted(requestId, msg.sender, proposal);

        return requestId;
    }

    /// @notice Check the result of a proposal evaluation
    function getProposalResult(
        uint256 requestId
    ) external view returns (string memory proposal, string memory result, bool completed) {
        ProposalRequest storage request = proposals[requestId];
        require(request.proposer != address(0), "Request does not exist");

        return (request.proposal, request.result, request.completed);
    }

    /// @notice Refund excess ETH if any
    function _refundExcessPayment(uint256 requiredAmount) internal {
        uint256 excessAmount = msg.value - requiredAmount;
        if (excessAmount > 0) {
            (bool success, ) = msg.sender.call{ value: excessAmount }("");
            require(success, "ETH refund failed");
        }
    }
}
