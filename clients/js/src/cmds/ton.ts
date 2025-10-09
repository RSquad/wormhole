import { beginCell } from "@ton/core";
import yargs from "yargs";
import {
    GOVERNANCE_CHAIN,
    GOVERNANCE_EMITTER,
    NETWORK_OPTIONS,
    NETWORKS,
    RPC_OPTIONS,
} from "../consts";
import { evm_address, getNetwork } from "../utils";
import {
    chainToChainId,
    contracts,
} from "@wormhole-foundation/sdk-base";

export const command = "ton";
export const desc = "TON utilities";
export const builder = (y: typeof yargs) =>
    y
        .command(
            "init-wormhole",
            "Init Wormhole core contract",
            (yargs) =>
                yargs
                    .option("network", NETWORK_OPTIONS)
                    .option("rpc", RPC_OPTIONS)
                    .option("chain-id", {
                        describe: "Chain id",
                        type: "number",
                        default: chainToChainId("Ton"),
                        demandOption: false,
                    })
                    .option("governance-chain-id", {
                        describe: "Governance chain id",
                        type: "number",
                        default: GOVERNANCE_CHAIN,
                        demandOption: false,
                    })
                    .option("governance-address", {
                        describe: "Governance address",
                        type: "string",
                        default: GOVERNANCE_EMITTER,
                        demandOption: false,
                    })
                    .option("guardian-address", {
                        alias: "g",
                        demandOption: true,
                        describe: "Initial guardian's addresses (CSV)",
                        type: "string",
                    })
                    .option("contract-address", {
                        describe: "Core contract address",
                        type: "string",
                        demandOption: false,
                    }),
            async (argv) => {
                const network = getNetwork(argv.network);

                const contract_address =
                    argv["contract-address"] ||
                    contracts.coreBridge(network, "Ton");
                    
                if (!contract_address) {
                    throw new Error("Contract address is required");
                }

                const guardian_addresses = argv["guardian-address"]
                    .split(",")
                    .map((address) => evm_address(address).substring(24));
                const chain_id = argv["chain-id"];
                const governance_address = evm_address(argv["governance-address"]);
                const governance_chain_id = argv["governance-chain-id"];

                const initCell = beginCell()
                    .storeUint(chain_id, 16)
                    .storeUint(governance_chain_id, 16)
                    .storeBuffer(Buffer.from(governance_address, "hex"))
                    .storeUint(guardian_addresses.length, 8);
                    
                guardian_addresses.forEach((address) => {
                    initCell.storeBuffer(Buffer.from(address, "hex"));
                });

                const rpc = argv.rpc ?? NETWORKS[network].Ton?.rpc;
                
                console.log("TON Wormhole initialization would be sent here");
                console.log(`Contract: ${contract_address}`);
                console.log(`Chain ID: ${chain_id}`);
                console.log(`Governance Chain ID: ${governance_chain_id}`);
                console.log(`Governance Address: ${governance_address}`);
                console.log(`Guardians: ${guardian_addresses.length}`);

                throw new Error("TON init-wormhole not fully implemented yet. Please use TON-specific tools.");
            }
        )
        .command(
            "send-example-message <message>",
            "Send example message",
            (yargs) =>
                yargs
                    .positional("message", {
                        type: "string",
                        describe: "Message to send",
                        demandOption: true,
                    })
                    .option("network", NETWORK_OPTIONS)
                    .option("rpc", RPC_OPTIONS)
                    .option("sender", {
                        describe: "Sender address",
                        type: "string",
                        demandOption: false,
                    }),
            async (argv) => {
                const network = getNetwork(argv.network);
                const rpc = argv.rpc ?? NETWORKS[network].Ton?.rpc;
                
                if (!rpc) {
                    throw new Error("RPC URL is required");
                }
                
                const message = argv.message;
                
                console.log("TON example message would be sent here");
                console.log(`Message: ${message}`);
                console.log(`Network: ${network}`);
                console.log(`RPC: ${rpc}`);

                throw new Error("TON send-example-message not fully implemented yet. Please use TON-specific tools.");
            }
        )
        .strict()
        .demandCommand();
export const handler = () => {};