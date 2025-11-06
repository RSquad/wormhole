// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../contracts/ton_test/contracts/Executor.sol";
import "../contracts/ton_test/contracts/SimpleCommentIntegrator.sol";
import "../contracts/ton_test/contracts/MockWormhole.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

contract DeployTonTestContracts is Script {
    function run() public returns (
        address executor,
        address integrator,
        address mockWormhole
    ) {
        vm.startBroadcast();

        // Deploy Executor with TON chain ID (62)
        Executor executorContract = new Executor(62);
        console.log("Executor deployed at:", address(executorContract));

        // Deploy SimpleCommentIntegrator
        SimpleCommentIntegrator integratorContract = new SimpleCommentIntegrator();
        console.log("SimpleCommentIntegrator deployed at:", address(integratorContract));

        // Deploy MockWormhole
        MockWormhole mockWormholeContract = new MockWormhole();
        console.log("MockWormhole deployed at:", address(mockWormholeContract));

        vm.stopBroadcast();

        return (
            address(executorContract),
            address(integratorContract),
            address(mockWormholeContract)
        );
    }
}
