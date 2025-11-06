// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

interface IExecutor {
    event RequestForExecution(
        address indexed quoter,
        uint256 feeAmount,
        uint16 dstChain,
        bytes32 dstAddr,
        address refundAddr,
        bytes signedQuoteBytes,
        bytes requestBytes,
        bytes relayInstructions
    );

    function requestExecution(
        uint16 dstChain,
        bytes32 dstAddr,
        address refundAddr,
        bytes calldata signedQuoteBytes,
        bytes calldata requestBytes,
        bytes calldata relayInstructions
    ) external payable;
}
