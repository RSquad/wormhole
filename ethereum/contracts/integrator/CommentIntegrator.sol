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
        address to;
        string comment;
    }
    
    event CommentSent(
        address indexed sender, 
        address indexed to, 
        string comment, 
        uint64 sequence
    );
    
    event CommentReceived(
        uint16 indexed fromChain,
        bytes32 indexed fromAddress,
        address indexed to, 
        string comment
    );
    
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
        address to,
        string memory comment,
        uint32 nonce,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence) {
        bytes memory payload = encodeCommentVaa(to, comment);
        
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
    }
    
    /**
     * @notice Encode a CommentVaa into bytes
     * @param to Recipient address
     * @param comment Comment text
     * @return Encoded payload
     */
    function encodeCommentVaa(address to, string memory comment) 
        public pure returns (bytes memory) 
    {
        return abi.encodePacked(
            to,                          // 20 bytes
            uint16(bytes(comment).length), // 2 bytes
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
        
        address to = payload.toAddress(index);
        index += 20;
        
        uint16 commentLength = payload.toUint16(index);
        index += 2;
        
        require(payload.length >= index + commentLength, "Invalid comment length");
        
        string memory comment = string(payload.slice(index, commentLength));
        
        return CommentVaa({
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


