// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;

import "../interfaces/IWormhole.sol";
import "../libraries/external/BytesLib.sol";

/**
 * @title CommentIntegrator
 * @notice Integrator contract for sending and receiving comments via Wormhole
 * @dev Supports bidirectional messaging between Ethereum and other chains (e.g., TON)
 */
contract CommentIntegrator {
    using BytesLib for bytes;
    
    address public wormhole;
    
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
    
    event CommentReceived(uint16 indexed fromChainId, bytes32 from, uint16 chainId, bytes32 to, string comment);
    
    constructor(address _wormhole) {
        require(_wormhole != address(0), "Invalid wormhole address");
        wormhole = _wormhole;
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
     * @notice Relay a comment received from another chain
     * @param encodedVaa The VAA containing the comment
     */
    function relayComment(bytes memory encodedVaa) public returns (bool) {
        (IWormhole.VM memory vm, bool valid, string memory reason) = 
            IWormhole(wormhole).parseAndVerifyVM(encodedVaa);
        
        require(valid, reason);
        
        CommentVaa memory commentVaa = decodeCommentVaa(vm.payload);
        
        emit CommentReceived(
            vm.emitterChainId,
            vm.emitterAddress,
            commentVaa.chainId,
            commentVaa.to, 
            commentVaa.comment
        );
        
        // Optional: implement callback to recipient
        // This allows contracts to handle incoming comments
        // (bool success, ) = commentVaa.to.call(
        //     abi.encodeWithSignature(
        //         "onCommentReceived(uint16,bytes32,string)",
        //         vm.emitterChainId,
        //         vm.emitterAddress,
        //         commentVaa.comment
        //     )
        // );
        // Note: we don't revert on failure to allow EOA recipients
        return true;
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
            to,                          // 32 bytes
            bytes(comment)               // variable length
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


