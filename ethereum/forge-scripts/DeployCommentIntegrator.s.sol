// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "../contracts/integrator/CommentIntegrator.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

// DeployCommentIntegrator is a forge script to deploy the CommentIntegrator contract. Use ./sh/deployCommentIntegrator.sh to invoke this.
contract DeployCommentIntegrator is Script {
    function test() public {} // Exclude this from coverage report.

    function dryRun() public returns (address) {
        return _deploy();
    }

    function run() public returns (address deployedAddress) {
        vm.startBroadcast();
        (deployedAddress) = _deploy();
        vm.stopBroadcast();
    }

    function _deploy() internal returns (address deployedAddress) {
        // Get Wormhole address from environment or use devnet default
        address wormholeAddress = vm.envOr("WORMHOLE_ADDRESS", address(0xC89Ce4735882C9F0f0FE26686c53074E09B0D550));
        require(wormholeAddress != address(0), "WORMHOLE_ADDRESS not set");
        
        // Get Executor address from environment
        address executorAddress = vm.envOr("EXECUTOR_ADDRESS", address(0));
        require(executorAddress != address(0), "EXECUTOR_ADDRESS not set");
        
        // Use CREATE2 with salt to get deterministic address
        // Salt is computed from a fixed string to ensure deterministic deployment
        bytes32 salt = keccak256(abi.encodePacked("CommentIntegrator-0.0.1-devnet"));
        CommentIntegrator integratorContract = new CommentIntegrator{salt: salt}(wormholeAddress, executorAddress);
        
        console.log("CommentIntegrator deployed at:", address(integratorContract));
        console.log("Wormhole address:", wormholeAddress);
        console.log("Executor address:", executorAddress);
        return address(integratorContract);
    }
}

