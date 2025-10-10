import { ethers } from "ethers";
import yargs from "yargs";
import { NETWORK_OPTIONS, NETWORKS } from "../../consts";
import { getNetwork } from "../../utils";
import { Chain, PlatformToChains } from "@wormhole-foundation/sdk-base";

export const command = "send-message <chain> <to> <comment>";
export const desc = "Send a comment via Ethereum CommentIntegrator and print sequence";

export const builder = (y: typeof yargs) =>
  y
    .positional("chain", {
      describe: "EVM chain (e.g., Ethereum)",
      type: "string",
      demandOption: true,
    })
    .positional("to", {
      describe: "Recipient EVM address (20-byte)",
      type: "string",
      demandOption: true,
    })
    .positional("comment", {
      describe: "Comment text",
      type: "string",
      demandOption: true,
    })
    .option("network", NETWORK_OPTIONS)
    .option("rpc", { describe: "RPC endpoint", type: "string" })
    .option("contract", {
      alias: "a",
      describe: "CommentIntegrator contract address",
      type: "string",
      demandOption: true,
    })
    .option("nonce", { describe: "Message nonce", type: "number", default: 0 })
    .option("consistency-level", {
      describe: "Consistency level",
      type: "number",
      default: 15,
    });

export const handler = async (argv: Awaited<ReturnType<typeof builder>["argv"]>) => {
  const network = getNetwork(argv.network);
  const chain = argv.chain as Chain;
  const rpc = argv.rpc ?? NETWORKS[network][chain]?.rpc;
  if (!rpc) throw new Error(`No ${network} rpc defined for ${chain}`);

  const key = NETWORKS[network][chain]?.key;
  if (!key) throw new Error(`No ${network} key defined for ${chain}`);

  const integrator = argv.contract as string;
  const to = argv.to as string;
  const comment = argv.comment as string;
  const nonce = (argv.nonce as number) ?? 0;
  const cl = (argv["consistency-level"] as number) ?? 15;

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);

  const integratorAbi = [
    "function wormhole() external view returns (address)",
    "function sendComment(address to, string comment, uint32 nonce, uint8 consistencyLevel) external payable returns (uint64)",
    "event CommentSent(address indexed sender, address indexed to, string comment, uint64 sequence)"
  ];

  const contract = new ethers.Contract(integrator, integratorAbi, wallet);

  const wormholeAddr: string = await contract.wormhole();
  const wormholeAbi = ["function messageFee() external view returns (uint256)"];
  const wormhole = new ethers.Contract(wormholeAddr, wormholeAbi, wallet);
  const fee: ethers.BigNumber = await wormhole.messageFee();

  const tx = await contract.sendComment(to, comment, nonce >>> 0, cl & 0xff, { value: fee });
  console.log(`Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  // find CommentSent
  const iface = new ethers.utils.Interface(integratorAbi);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "CommentSent") {
        const sequence = parsed.args.sequence as ethers.BigNumber;
        console.log(`Sequence: ${sequence.toString()}`);
        break;
      }
    } catch {}
  }
};


