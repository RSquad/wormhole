import yargs from "yargs";
import axios from "axios";
import { parse as parseVaa } from "../vaa";

export const command = "get-vaa <chainId> <emitter> <sequence>";
export const desc = "Fetch signed VAA by chainId/emitter/sequence and print base64/hex and summary";

export const builder = (y: typeof yargs) =>
  y
    .positional("chainId", {
      describe: "Emitter chain id (number)",
      type: "number",
      demandOption: true,
    })
    .positional("emitter", {
      describe: "Emitter address (32-byte hex, with or without 0x)",
      type: "string",
      demandOption: true,
    })
    .positional("sequence", {
      describe: "VAA sequence (uint64)",
      type: "string",
      demandOption: true,
    })
    .option("api", {
      describe: "Guardian REST base URL",
      type: "string",
      default: "http://localhost:7071",
    })
    .option("output", {
      describe: "What to print",
      choices: ["all", "base64", "hex", "json"],
      default: "all",
    });

export const handler = async (argv: Awaited<ReturnType<typeof builder>["argv"]>) => {
  const chainId = argv.chainId as number;
  const emitterRaw = (argv.emitter as string).toLowerCase().replace(/^0x/, "");
  const sequence = argv.sequence as string;
  const api = argv.api as string;
  const output = argv.output as string;

  const url = `${api.replace(/\/$/, "")}/v1/signed_vaa/${chainId}/${emitterRaw}/${sequence}`;
  const res = await axios.get(url);

  const body = res.data || {};
  const base64: string = body.vaaBytes || body.vaa || body.data || body.base64;
  if (!base64) {
    throw new Error("Не удалось найти поле vaaBytes в ответе");
  }

  const buf = Buffer.from(base64, "base64");
  const hex = buf.toString("hex");

  if (output === "base64" || output === "all") {
    console.log(`VAA (base64): ${base64}`);
  }
  if (output === "hex" || output === "all") {
    console.log(`VAA (hex): ${hex}`);
  }
  if (output === "json") {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  try {
    const parsed = parseVaa(buf as Buffer);
    const emitterAddrHex =
      typeof parsed.emitterAddress === "string"
        ? (parsed.emitterAddress.startsWith("0x") ? parsed.emitterAddress : `0x${parsed.emitterAddress}`)
        : `0x${Buffer.from(parsed.emitterAddress as any).toString("hex")}`;
    console.log("Parsed:");
    console.log(`  version: ${parsed.version}`);
    console.log(`  guardianSetIndex: ${parsed.guardianSetIndex}`);
    console.log(`  timestamp: ${parsed.timestamp}`);
    console.log(`  emitterChain: ${parsed.emitterChain}`);
    console.log(`  emitterAddress: ${emitterAddrHex}`);
    console.log(`  sequence: ${parsed.sequence}`);
    console.log(`  consistencyLevel: ${parsed.consistencyLevel}`);
    // payload brief
    const t = (parsed.payload as any)?.type || "Other";
    console.log(`  payload.type: ${t}`);
    if (t === "Comment") {
      const p = parsed.payload as any;
      if (p.to) {
        const toHex = Buffer.from(p.to).toString("hex");

        const prefix = p.chain_id === 62 ? "0:" : "0x";

        console.log("  payload.to:", prefix + toHex);
      }
      console.log(`  payload.comment: ${p.commentBytes}`);
    }
  } catch (e) {
    console.log("Не удалось распарсить VAA payload этим CLI, выводим только сырой vaa.");
  }
}
