// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;

/**
 * @title MockWormhole
 * @notice Mock Wormhole contract for testing that always validates VAAs as true
 */
contract MockWormhole {
    struct VM {
        uint8 version;
        uint32 timestamp;
        uint32 nonce;
        uint16 emitterChainId;
        bytes32 emitterAddress;
        uint64 sequence;
        uint8 consistencyLevel;
        bytes payload;
        
        uint32 guardianSetIndex;
        bytes32 hash;
    }
    
    event LogMessagePublished(
        address indexed sender,
        uint64 sequence,
        uint32 nonce,
        bytes payload,
        uint8 consistencyLevel
    );
    
    uint64 private nextSeq = 1;
    
    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence) {
        sequence = nextSeq++;
        emit LogMessagePublished(msg.sender, sequence, nonce, payload, consistencyLevel);
    }
    
    function parseAndVerifyVM(bytes calldata encodedVM) 
        external 
        pure 
        returns (VM memory vm, bool valid, string memory reason) 
    {
        require(encodedVM.length > 0, "Empty VAA");

        vm.version = 1;
        vm.guardianSetIndex = 0;
        vm.timestamp = 0;
        vm.nonce = 0;
        vm.emitterChainId = 62; // TON
        vm.emitterAddress = bytes32(0);
        vm.sequence = 1;
        vm.consistencyLevel = 1;

        uint8 sigCount = uint8(encodedVM[6]);
        uint256 payloadStart = 6 + 1 + sigCount * 66 + 4 + 4 + 2 + 32 + 8 + 1;
        
        if (encodedVM.length > payloadStart) {
            vm.payload = encodedVM[payloadStart:];
        } else {
            vm.payload = new bytes(0);
        }

        valid = true;
        reason = "";
    }
    
    function messageFee() external pure returns (uint256) {
        return 0;
    }
}

