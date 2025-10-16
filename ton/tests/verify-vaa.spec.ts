import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Wormhole } from '../wrappers/Wormhole';
import { Cell, toNano } from '@ton/core';
import { Random } from './TestUtils';
import { GOVERNANCE_CHAIN_ID, GOVERNANCE_CONTRACT, GUARDIAN_SET_EXPIRY, TON_CHAIN_ID } from '../wrappers/Constants';
import { createEmptyGuardianSet, createEmptySequences, parseVaa, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';

describe('Verify VAA signatures', () => {
    let blockchain: Blockchain;
    let wormhole: SandboxContract<Wormhole>;
    const guardianSetIndex = 4;
    const guardianSet = {
        index: 4,
        addresses: [
          "0x5893B5A76c3f739645648885bDCcC06cd70a3Cd3",
          "0xfF6CB952589BDE862c25Ef4392132fb9D4A42157",
          "0x114De8460193bdf3A2fCf81f86a09765F4762fD1",
          "0x107A0086b32d7A0977926A205131d8731D39cbEB",
          "0x8C82B2fd82FaeD2711d59AF0F2499D16e726f6b2",
          "0x11b39756C042441BE6D8650b69b54EbE715E2343",
          "0x54Ce5B4D348fb74B958e8966e2ec3dBd4958a7cd",
          "0x15e7cAF07C4e3DC8e7C469f92C8Cd88FB8005a20",
          "0x74a3bf913953D695260D88BC1aA25A4eeE363ef0",
          "0x000aC0076727b35FBea2dAc28fEE5cCB0fEA768e",
          "0xAF45Ced136b9D9e24903464AE889F5C8a723FC14",
          "0xf93124b7c738843CBB89E864c862c38cddCccF95",
          "0xD2CC37A4dc036a8D232b48f62cDD4731412f4890",
          "0xDA798F6896A3331F64b48c12D1D57Fd9cbe70811",
          "0x71AA1BE1D36CaFE3867910F99C09e347899C19C3",
          "0x8192b6E7387CCd768277c17DAb1b7a5027c0b3Cf",
          "0x178e21ad2E77AE06711549CFBB1f9c7a9d8096e8",
          "0x5E1487F35515d02A92753504a8D75471b9f49EdB",
          "0x6FbEBc898F403E4773E95feB15E80C9A99c8348d"
        ].map(address => Buffer.from(address.slice(2).padStart(64, '0'), 'hex')),
  };

    beforeAll(async () => {
        const code = await compile('Wormhole');
        blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
        const guardianSets = createEmptyGuardianSet();
        guardianSets.set(guardianSetIndex, { keys: guardianSet.addresses, expirationTime: GUARDIAN_SET_EXPIRY });
        wormhole = blockchain.openContract(
            Wormhole.createFromConfig(
                {
                    id: Random.id(16),
                    messageFee: toNano(0.1),
                    sequences: createEmptySequences(),
                    guardianSets,
                    guardianSetIndex,
                    guardianSetExpiry: GUARDIAN_SET_EXPIRY,
                    chainId: TON_CHAIN_ID,
                    governanceChainId: GOVERNANCE_CHAIN_ID,
                    governanceContract: GOVERNANCE_CONTRACT,
                },
                code,
            ),
        );

        await wormhole.sendDeploy(deployer.getSender(), toNano(1));
    });

    it.each([{
        vaaBase64: "AQAAAAQNAvy2yiwUFUsHZ50aYZjBE+AoeKw5ze8SP7oKC2KH/CbtClL79qBA9oRSi+tkFel7SC54dkzb9vVdgw1BYqlKUP8BA++IWbnB/ejTv3VWr9ZR3TC44B5l5ENWIsbGAlhUkRHuYUJvOaRkQPx+zPbbK8lODKfYHch1kb9ysOAEAy8O0mQABSwUz8geEN4Xcp+9wve/JXcKs4AU3v1PffBCsONUllhad4x40fwlnm5pTluxGrp8Lc7/+ixvwH+mkjb2PJd7ci4BBwCrPPBGG/ZnS7tyuuUYSY0mKWjn3IJ1qSQ3ge5UQddyKvqDbQ3zDUPoWPqV2UiOIkaoQwm5bdNCBLi9W3Msx38BCRfvNgW+Ct6CAKn+SomMQ395wjn15pSle8AM/7duad8CH8Q0Rfa4ohvUrd8kW4yBlDwOSTtcN5USxoaBtwFjiywBCj+qESYD/2UktwcLkX4YBBwGVjGC779fF5ohXy0hCGilP9ouSRWskSKPYiIOrzSZ8pju5BACDPHvY44zEc3hh+UAC5VGC2PUO7ubra5nCn+kupsDy4+LDyNeuBT9NaFAZfmVcJBU2p9nINTdLczOOQeaV48PndBs5Vn0In743PbQDVEBDO8uqYkcF7fLrH81XTRAuuHkg71jNQeHLqPDrpxQpyAWGpxZWv/Jk8P7Yqv1NiufZgDN8aq/qtO6iO77NWFLdkwADbySQlNaHm7WYaA7dv4DxuSPzntrgs1sQpzXJY+Dl2OeVYk2igRa7RnKNX/qcSIGUjHuXJ9kCjkXhG0Hv1cZb/YAD3JwzIRoX/Wj6NBj4HifhHt4V7A3JYF4oNGLgDJ7fl5ib8kmckGUZtomz8n9gBlw6Qz6WNOD5Vle3a5IlFQDGxoAEIhiTmK59VSjKBTSrZWMaYGcYzggpEaXsKEt849WyLucWmm/lcrq5nlD950EkGP+XIfvSHWWtMNA5KCBXjMaAPYBEaw8Sws0kBA0FBt1LmZ59W103EmJqC3g1sX/+oSpahNDWRGqF3JCZH7UVjAB86r1E1r2ZQMRli7SeceiiatwqkQAEs+0leN8bu5GKhJXeIUy0YSEEwEyTIgoWZywTZsB/mlQGw84E4yu3m6UbnQAzhGkAHG+eOepob+sGLsyBxKIxEMBaO/1OwAAAAAAAgAAAAAAAAAAAAAAAD7hiyIUr/lwANl0z2R+fDR+j6WFAAAAAAAIwvoBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABrSdIAAAAAAAAAAAAAAAAAwCqqObIj/o0KDlxPJ+rZCDx1bMIAAsthe2OcU3vQiEb2G+RIHDT5OR8bj1PQgt4CTiMlCBE+AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    }])('verify VAA', async ({ vaaBase64 }) => {
        const parsedVaa = parseVaa(Buffer.from(vaaBase64, "base64"));
        const vmCell = VAAtoCell(parsedVaa, splitBufferToCells);
        const verified = await wormhole.getVerifyVM(vmCell);
        expect(verified).toBe(true);
    });
});