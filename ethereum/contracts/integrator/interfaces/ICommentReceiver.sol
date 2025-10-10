// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;

/**
 * @title ICommentReceiver
 * @notice Interface for contracts that want to receive comment notifications
 */
interface ICommentReceiver {
    /**
     * @notice Called when a comment is received for this contract
     * @param fromChain The chain ID where the comment originated
     * @param fromAddress The address that sent the comment (bytes32 format)
     * @param comment The comment text
     */
    function onCommentReceived(
        uint16 fromChain,
        bytes32 fromAddress,
        string calldata comment
    ) external;
}


