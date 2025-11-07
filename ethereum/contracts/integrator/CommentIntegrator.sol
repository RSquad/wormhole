// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;

import "../interfaces/IWormhole.sol";
import "./interfaces/IExecutor.sol";
import "../libraries/external/BytesLib.sol";

/**
 * @title CommentIntegrator
 * @notice Integrator contract for sending and receiving comments via Wormhole
 * @dev Supports bidirectional messaging between Ethereum and other chains (e.g., TON)
 */
contract CommentIntegrator {
    using BytesLib for bytes;
    
    address public wormhole;
    address public executor;
    
    struct CommentVaa {
        uint16 chainId;
        bytes32 to;
        string comment;
    }
    
    event CommentSent(
        address indexed sender, 
        bytes32 indexed to, 
        string comment, 
        uint64 sequence
    );
    
    event CommentReceived( 
        uint16 indexed fromChainId,
        bytes32 indexed from, 
        bytes32 indexed to,
        string comment);

    struct RelayParams {
        address executor;
        uint16 dstChain;
        bytes32 dstAddr;
        address refundAddr;
        bytes signedQuote;
        bytes requestBytes;
        bytes relayInstructions;
        uint256 relayFee;
    }
    
    constructor(address _wormhole, address _executor) {
        require(_wormhole != address(0), "Invalid wormhole address");
        require(_executor != address(0), "Invalid executor address");
        wormhole = _wormhole;
        executor = _executor;
    }
    
    /**
     * @notice Send a comment to another chain via Wormhole
     * @param to Recipient address on the destination chain
     * @param comment The comment text to send
     * @param nonce Arbitrary nonce for the message
     * @param consistencyLevel Desired consistency level (finality)
     * @return sequence The sequence number of the published message
     */
    function sendComment(
        uint16 chainId,
        bytes32 to,
        string memory comment,
        uint32 nonce,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence) {
        bytes memory payload = encodeCommentVaa(chainId, to, comment);
        
        sequence = IWormhole(wormhole).publishMessage{value: msg.value}(
            nonce,
            payload,
            consistencyLevel
        );
        
        emit CommentSent(msg.sender, to, comment, sequence);
    }

    /**
     * @notice Send a comment and request relay execution on destination
     * @dev Publishes a Wormhole message, then calls Executor.requestExecution with provided params.
     *      The requestBytes is automatically computed from chainId (2), contract address, and sequence.
     * @param chainId Emitter chain id to encode in payload
     * @param to Recipient address on destination chain (bytes32)
     * @param comment Comment text
     * @param nonce Message nonce
     * @param consistencyLevel Desired consistency level (finality)
     * @param p Relay parameters (executor, dstChain, dstAddr, refundAddr, signedQuote, relayInstructions, relayFee).
     *          Note: requestBytes in RelayParams is ignored and computed automatically.
     * @return sequence The sequence number of the published message
     */
    function sendCommentWithRelay(
        uint16 chainId,
        bytes32 to,
        string calldata comment,
        uint32 nonce,
        uint8 consistencyLevel,
        RelayParams calldata p
    ) external payable returns (uint64 sequence) {
        // Determine fee required by Wormhole core
        uint256 messageFee = IWormhole(wormhole).messageFee();
        require(msg.value >= messageFee + p.relayFee, "insufficient value");

        // 1) Publish message to Wormhole core
        sequence = _publishComment(chainId, to, comment, nonce, consistencyLevel, messageFee);
        emit CommentSent(msg.sender, to, comment, sequence);

        // 2) Compute requestBytes: chainId (2 bytes) + emitterAddress (32 bytes) + sequence (8 bytes)
        // chainId = 2 (Ethereum devnet)
        // emitterAddress = address(this) zero-padded to 32 bytes
        // sequence = sequence from Wormhole
        bytes memory computedRequestBytes = abi.encodePacked(
            uint16(2),                    // chainId (2 bytes)
            bytes32(uint256(uint160(address(this)))),  // emitterAddress (32 bytes, zero-padded)
            sequence                      // sequence (8 bytes)
        );

        // 3) Request execution on destination via Executor
        _requestExecution(p.executor, p.dstChain, p.dstAddr, p.refundAddr, p.signedQuote, computedRequestBytes, p.relayInstructions, p.relayFee);
    }

    function _publishComment(
        uint16 chainId,
        bytes32 to,
        string calldata comment,
        uint32 nonce,
        uint8 consistencyLevel,
        uint256 messageFee
    ) internal returns (uint64) {
        return IWormhole(wormhole).publishMessage{value: messageFee}(
            nonce,
            encodeCommentVaa(chainId, to, comment),
            consistencyLevel
        );
    }

    function _requestExecution(
        address executorAddr,
        uint16 dstChain,
        bytes32 dstAddr,
        address refundAddr,
        bytes calldata signedQuote,
        bytes memory requestBytes,
        bytes calldata relayInstructions,
        uint256 relayFee
    ) internal {
        // Use the executor address from constructor if executorAddr is zero, otherwise use provided address
        address exec = executorAddr != address(0) ? executorAddr : executor;
        IExecutor(exec).requestExecution{value: relayFee}(
            dstChain,
            dstAddr,
            refundAddr,
            signedQuote,
            requestBytes,
            relayInstructions
        );
    }
    
    /**
     * @notice Relay a comment received from another chain
     * @param encodedVaa The VAA containing the comment
     */
    function relayComment(bytes memory encodedVaa) external {
        (IWormhole.VM memory vm, bool valid, string memory reason) = 
            IWormhole(wormhole).parseAndVerifyVM(encodedVaa);
        
        require(valid, reason);
        
        CommentVaa memory commentVaa = decodeCommentVaa(vm.payload);
        
        emit CommentReceived(
            vm.emitterChainId,
            vm.emitterAddress,
            commentVaa.to,
            commentVaa.comment
        );
    }
    
    /**
     * @notice Encode a CommentVaa into bytes
     * @param to Recipient address
     * @param comment Comment text
     * @return Encoded payload
     */
    function encodeCommentVaa(uint16 chainId, bytes32 to, string memory comment) 
        public pure returns (bytes memory) 
    {
        return abi.encodePacked(
            chainId,
            to,                    // 32 bytes
            comment               // variable length
        );
    }
    
    /**
     * @notice Decode a CommentVaa from bytes
     * @param payload Encoded payload
     * @return Decoded CommentVaa struct
     */
    function decodeCommentVaa(bytes memory payload) 
        public pure returns (CommentVaa memory) 
    {
        require(payload.length >= 22, "Payload too short");
        
        uint256 index = 0;

        uint16 chainId = payload.toUint16(index);
        index += 2;
        
        bytes32 to = payload.toBytes32(index);
        index += 32;
        
        string memory comment = string(payload.slice(index, payload.length - index));
        
        return CommentVaa({
            chainId: chainId,
            to: to,
            comment: comment
        });
    }
    
    /**
     * @notice Get the wormhole message fee
     * @return fee The message fee in wei
     */
    function getMessageFee() external view returns (uint256 fee) {
        fee = IWormhole(wormhole).messageFee();
    }
}


