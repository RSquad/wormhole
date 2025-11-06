// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "../contracts/integrator/Executor.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

// DeployExecutor is a forge script to deploy the Executor contract. Use ./sh/deployExecutor.sh to invoke this.
contract DeployExecutor is Script {
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
        // Use CREATE2 with salt to get deterministic address
        // Salt is computed from executorVersion to ensure deterministic deployment
        bytes32 salt = keccak256(abi.encodePacked(executorVersion));
        Executor executorContract = new Executor{salt: salt}(2);
        
        console.log("Executor deployed at:", address(executorContract));
        return address(executorContract);
    }
}

