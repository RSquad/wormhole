// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "../contracts/integrator/Executor.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

contract DeployExecutor is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Executor with Ethereum devnet chain ID (2)
        Executor executorContract = new Executor(2);
        console.log("Executor deployed at:", address(executorContract));

        vm.stopBroadcast();
    }
}

