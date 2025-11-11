import {
    TonClient,
    OpenedContract,
    WalletContractV1R1,
    WalletContractV1R2,
    WalletContractV1R3,
    WalletContractV2R1,
    WalletContractV2R2,
    WalletContractV3R1,
    WalletContractV3R2,
    WalletContractV4,
    WalletContractV5R1,
} from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

export enum WalletVersion {
    V1R1 = "v1r1",
    V1R2 = "v1r2",
    V1R3 = "v1r3",
    V2R1 = "v2r1",
    V2R2 = "v2r2",
    V3R1 = "v3r1",
    V3R2 = "v3r2",
    V4R1 = "v4r1",
    V4R2 = "v4r2",
    V5R1Final = "v5r1_final",
}

type AnyWallet =
    | InstanceType<typeof WalletContractV1R1>
    | InstanceType<typeof WalletContractV1R2>
    | InstanceType<typeof WalletContractV1R3>
    | InstanceType<typeof WalletContractV2R1>
    | InstanceType<typeof WalletContractV2R2>
    | InstanceType<typeof WalletContractV3R1>
    | InstanceType<typeof WalletContractV3R2>
    | InstanceType<typeof WalletContractV4>
    | InstanceType<typeof WalletContractV5R1>;

function createWalletByVersion(version: string, publicKey: Buffer, workchain = 0): AnyWallet {
    switch (version) {
        case WalletVersion.V1R1:
            return WalletContractV1R1.create({ workchain, publicKey });
        case WalletVersion.V1R2:
            return WalletContractV1R2.create({ workchain, publicKey });
        case WalletVersion.V1R3:
            return WalletContractV1R3.create({ workchain, publicKey });
        case WalletVersion.V2R1:
            return WalletContractV2R1.create({ workchain, publicKey });
        case WalletVersion.V2R2:
            return WalletContractV2R2.create({ workchain, publicKey });
        case WalletVersion.V3R1:
            return WalletContractV3R1.create({ workchain, publicKey });
        case WalletVersion.V3R2:
            return WalletContractV3R2.create({ workchain, publicKey });
        case WalletVersion.V4R1:
            return WalletContractV4.create({ workchain, publicKey });
        case WalletVersion.V4R2:
            return WalletContractV4.create({ workchain, publicKey });
        case WalletVersion.V5R1Final:
            return WalletContractV5R1.create({ workchain, publicKey });
        default:
            new Error(`invalid wallet version: ${version}`);
    }
}

export async function openWalletFromMnemonic(
    client: TonClient,
    keyPair: KeyPair,
    walletVersion: string,
    workchain = 0,
): OpenedContract<T> {
    const wallet = await createWalletByVersion(walletVersion,keyPair.publicKey)

    const contract = await client.open(wallet);
    return { contract };
}

export async function initTonClientAndWallet(
    network: keyof typeof NETWORKS
): Promise<{
    client: TonClient;
    contract: OpenedContract<T>;
    keyPair: { publicKey: Buffer; secretKey: Buffer };
}> {
    const networkConfig = network["Ton"];
    if (!networkConfig) {
        throw new Error(`No network config for TON on ${network}`);
    }

    const mnemonic = networkConfig.key;
    if (!mnemonic) {
        throw new Error("No mnemonic/key for TON");
    }

    const rpc = networkConfig.rpc;
    if (!rpc) {
        throw new Error("No RPC for TON");
    }

    const rpc_key = networkConfig.rpc_key;
    if (!rpc_key) {
        throw new Error("No RPC key for TON");
    }

    const rpcUrl = networkConfig.rpc +`?api_key=${networkConfig.rpc_key}`;

    const walletVersion = networkConfig.wallet_version;
    if (!walletVersion) {
        throw new Error("No wallet version for TON");
    }

    const client = new TonClient({ endpoint: rpcUrl });

    const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));

    const contract = await openWalletFromMnemonic(client, keyPair, walletVersion);

    return { client, contract, keyPair };
}