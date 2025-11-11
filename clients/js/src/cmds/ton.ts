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
import { sendTonCommentWithRelay } from "../ton";

export const command = "ton";
export const desc = "TON utilities";
export const builder = (y: typeof yargs) =>
    y
        .command(
            "send-message <message>",
            "Send a Comment message via TON Integrator",
            (yargs) =>
                yargs
                    .positional("message", {
                        type: "string",
                        describe: "Message text",
                        demandOption: true,
                    })
                    .option("network", NETWORK_OPTIONS)
                    .option("rpc", RPC_OPTIONS)
                    .option("contract-address", {
                        alias: "a",
                        describe: "Integrator contract address",
                        type: "string",
                        demandOption: true,
                    })
                    .option("to", {
                        describe: "Recipient address (TON address or 32-byte hex)",
                        type: "string",
                        demandOption: false,
                    })
                    .option("chain-id", {
                        describe: "Destination chain id (uint16)",
                        type: "number",
                        demandOption: true,
                    })
                    .option("consistency-level", {
                        describe: "Consistency level",
                        type: "number",
                        default: 15,
                        demandOption: false,
                    })
                    .option("with-relay", {
                        describe: "Enable relay execution on destination chain",
                        type: "boolean",
                        default: false,
                        demandOption: false,
                    }),
            async (argv) => {
                const network = getNetwork(argv.network);
                const rpc = argv.rpc ?? NETWORKS[network].Ton?.rpc;
                if (!rpc) throw new Error("No TON RPC configured");

                const integrator = argv["contract-address"] as string;
                const msg = argv.message as string;
                const to = argv.to as string | undefined;
                const chainId = argv["chain-id"] as number;
                const cl = (argv["consistency-level"] as number) ?? 15;
                const withRelay = argv["with-relay"] as boolean;

                if (!withRelay) {
                    const { sendTonComment } = await import("../ton");
                    await sendTonComment(network, rpc, integrator, msg, to, chainId, cl);
                } else {
                    await sendTonCommentWithRelay(network, integrator, msg, to, chainId, cl);
                }
            }
        )
        .strict()
        .demandCommand();
export const handler = () => {};