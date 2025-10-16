import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Wormhole } from '../wrappers/Wormhole';
import { Cell, toNano } from '@ton/core';
import { Random } from './TestUtils';
import { GOVERNANCE_CHAIN_ID, GOVERNANCE_CONTRACT, GUARDIAN_SET_EXPIRY, TON_CHAIN_ID } from '../wrappers/Constants';
import { createEmptyGuardianSet, createEmptySequences, parseVaa, VAAtoCell } from '../wrappers/Structs';
import { splitBufferToCells } from '../wrappers/conversion';

describe('Calculate VAA hash', () => {
    let blockchain: Blockchain;
    let wormhole: SandboxContract<Wormhole>;
    let guardianSetIndex = 4;

    beforeAll(async () => {
        const code = await compile('Wormhole');
        blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
        wormhole = blockchain.openContract(
            Wormhole.createFromConfig(
                {
                    id: Random.id(16),
                    messageFee: toNano(0.1),
                    sequences: createEmptySequences(),
                    guardianSets: createEmptyGuardianSet(),
                    guardianSetIndex: guardianSetIndex,
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
        vaaID: "2/0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585/574202",
        vaaBase64: "AQAAAAQNAvy2yiwUFUsHZ50aYZjBE+AoeKw5ze8SP7oKC2KH/CbtClL79qBA9oRSi+tkFel7SC54dkzb9vVdgw1BYqlKUP8BA++IWbnB/ejTv3VWr9ZR3TC44B5l5ENWIsbGAlhUkRHuYUJvOaRkQPx+zPbbK8lODKfYHch1kb9ysOAEAy8O0mQABSwUz8geEN4Xcp+9wve/JXcKs4AU3v1PffBCsONUllhad4x40fwlnm5pTluxGrp8Lc7/+ixvwH+mkjb2PJd7ci4BBwCrPPBGG/ZnS7tyuuUYSY0mKWjn3IJ1qSQ3ge5UQddyKvqDbQ3zDUPoWPqV2UiOIkaoQwm5bdNCBLi9W3Msx38BCRfvNgW+Ct6CAKn+SomMQ395wjn15pSle8AM/7duad8CH8Q0Rfa4ohvUrd8kW4yBlDwOSTtcN5USxoaBtwFjiywBCj+qESYD/2UktwcLkX4YBBwGVjGC779fF5ohXy0hCGilP9ouSRWskSKPYiIOrzSZ8pju5BACDPHvY44zEc3hh+UAC5VGC2PUO7ubra5nCn+kupsDy4+LDyNeuBT9NaFAZfmVcJBU2p9nINTdLczOOQeaV48PndBs5Vn0In743PbQDVEBDO8uqYkcF7fLrH81XTRAuuHkg71jNQeHLqPDrpxQpyAWGpxZWv/Jk8P7Yqv1NiufZgDN8aq/qtO6iO77NWFLdkwADbySQlNaHm7WYaA7dv4DxuSPzntrgs1sQpzXJY+Dl2OeVYk2igRa7RnKNX/qcSIGUjHuXJ9kCjkXhG0Hv1cZb/YAD3JwzIRoX/Wj6NBj4HifhHt4V7A3JYF4oNGLgDJ7fl5ib8kmckGUZtomz8n9gBlw6Qz6WNOD5Vle3a5IlFQDGxoAEIhiTmK59VSjKBTSrZWMaYGcYzggpEaXsKEt849WyLucWmm/lcrq5nlD950EkGP+XIfvSHWWtMNA5KCBXjMaAPYBEaw8Sws0kBA0FBt1LmZ59W103EmJqC3g1sX/+oSpahNDWRGqF3JCZH7UVjAB86r1E1r2ZQMRli7SeceiiatwqkQAEs+0leN8bu5GKhJXeIUy0YSEEwEyTIgoWZywTZsB/mlQGw84E4yu3m6UbnQAzhGkAHG+eOepob+sGLsyBxKIxEMBaO/1OwAAAAAAAgAAAAAAAAAAAAAAAD7hiyIUr/lwANl0z2R+fDR+j6WFAAAAAAAIwvoBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABrSdIAAAAAAAAAAAAAAAAAwCqqObIj/o0KDlxPJ+rZCDx1bMIAAsthe2OcU3vQiEb2G+RIHDT5OR8bj1PQgt4CTiMlCBE+AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
        vaaHash: "ec7e825779320eb3a84aa9ffaf3a52b5668c02fc43bf9420445fdf6caeeb93ea"
    }, {
        vaaID: "2/000000000000000000000000bf5f3f65102ae745a48bd521d10bab5bf02a9ef4/81252",
        vaaBase64: "AQAAAAQNAErYvOkixheNnrnAfrzwMEHlA3/Wj/3VkUI+2Eic0xWPGAlnuoSGtCZhh1dC0RjfBqC46aRxRnfmgMRA5L+AvEABAc1U/EwEg4v4SWgwQ8DKI6yA3KuQuJN/iFsZqxb529zjNSw2OXK84i7R9ati8BB/7wd+PjNzJVzJbD7XnctNSooBAumfrooRWJyxFR4hB1+aPr2Fro8wRQYonWnX+zgo3uEQW2zmhTleTuD0FVsZVAx/drcBNGx1ozxTq2K95n1/Nq8AA+aGwrW60ZJoa1pw2vfHkg+PbX+qda7xlZAqDwW6bzSjDj+a4ybRuVVJenoRN43b5yXFJrYgaY8IUsFtisZSnv4ABkK3NjprkygIXw5NyW6iZx2RzeJZgc3vFb6CVyEssV0TWVgz5mTw+5BeV3nRTZvZDEc0/k6GB8HRS9SmDqjQh8cAB7Cf4OdXTuYiNUvFkHMSaCq4eEN06vJaLpSu72H2J16PVXcNUBeV48Qotr7OSMeesxW+bSWSu7co46e7tIJrkksACX/Ue7Aa+eH+gzt8i/2lFO7+/U1WkM1sDSyQjfzEcRYiRmJ/SXQOWhF6++FT3nqAS7yfvs/cbR7x8LsKB5geRXoACuoFKNzaLsvirZS9LeMcxCXRAW81ePrRTT73fhxTB3efcSNLSET9hQ1hm51vTNIFMZjCBFfxYA6BUROJmIWGih4BDf9cjnJ0rPLJz3U1twtbMTVzty16CNKD+Iaz4VRf0FmBQoMq4gCS/FSKLD9CQ6RrTgd3p9YudECifTKw/6l14rYBDidR9hpTEsHFYI9hbBypdFZ23JLon6pDtfJBkKmnM3goZJpr4v3LJ5VytI8X98Y3p/I9Ey6uXccSCnY5Mf0RiT0BDy6jBEoMtsQrrXnDfj/HUJknr8EVy5+1ESSOgf2ToQekDifa7q8xmTvhunCpmC8z5jbeco1A0CJmhSkfE2U3mJ8BEMpN9SDrmZL19x4+cCPJxydyJLMeFeq7EU9wtS+gaibiDrrEgIU7ybAgmE0HQn/7s5W9ijN+rjqrsnRJG1z5ZngBERQfboVgiL05yMID0jSYgQ1sxSH6ACjyMtpCBriKEjLWN8W7dP7UGTAD2Q7CeWyXjyHub6HOxwpLm1tWTR9LfHkBaO/1OwAAAAAAAgAAAAAAAAAAAAAAAL9fP2UQKudFpIvVIdELq1vwKp70AAAAAAABPWQBAQAAAAAAAAAAAAAAAMAqqjmyI/6NCg5cTyfq2Qg8dWzCAALewgZVYVPNy7puAjJVCj89Zkbk+b1MBP0BPd7DeCYsmQABAAAAAAAAAAAAAAAA39EiYQoUrBLZNImMAtvsH3JwgRYAAgAAAAAACML6AAAAAGtIaZsAAAAAaPAG5gAAAAAAAWhkAAAAAAAAAAAAAAAAAAAAAG36Q/gkw7i2HnFf6L9Efyq6Y+WatTfxhs9mUVLCEUw5AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        vaaHash: "516450e34d7782ef9ddc493bfcf68db8fd65dec6b6bc37bea1608a5ab3be14cc"
    }, {
        vaaID: "2/0000000000000000000000004c4e1f82d296d18b85982e0fd68324e8ea9950ca/1607",
        vaaBase64: "AQAAAAQNAB2oQ6X+Ixn2u6A7+/MPrmc3KYdj5QAXAUtpRNQ0GjCIW2m77TD0naa7XWy4kLtL2YuNdrKe1y7unn0rPNQTiHUAAbG5FPS2nQiJKtvyi5IQE1YLE/IPXWqdCArL6Gk8dho1JOVr3uiiohn22QhyXvbw9r8w9bPQdqvZBTUf6y4Xoo0AAt80XiWukSYRqvXSafyD1TC06SzLsQKKoPpI/wjKm3wnb8V68/3M7Kez1VKmQP7AVdgd3e/+61Rh9opDO2Y/I+MAA6qDM5NDZo86wRTmVmj/6rM6eN8fO9yfvtcLJ6L8AiEMPOMDrpWJYCbPU5ehYH4cvqKRDZhVJQ3jlzBaMLWLgVIABh9MsSc/ElK4sDo1xPifEE/gy3dORhNE5LaCkDJ1zSuRfEwtwp/mVxVOYB6lzfssVxIM5o+MlZlW93CTdH1hQ/IBB9iNv0sBF+pKDKDLhX9hFYKe8nTFCFmUOLv4wx/Hg+3mXihygDMfk85wCOgeAFIp22MZNb0oCKqEIFPkrIBN9WIACZ4lUMXdt16DZSQUSgjmKfhSwnfCJn0W24vvo3rUnx7/RWj3SuVaHGZnZHUiH4UHBffAjO+4pgthTtnXK3D7i70ACuTK7+Q9ou31D8g2WEqUw1SSzJmjnCLIurSzjYEIFI9Vd4je2FdUy5knp97hVDmhgpyGya2vd68mKXltvltlezgADKGQLd5YxO+grgchEJ5s7iJivsDvpPywkXMHyvySqy/pDj4aX2p7Kp2QLTBJ3U9QK8GE0hrYwlKXs3gpy9vhO4ABDe7g0tOyyhYtjNxKUyKHdGVKxYxmMrBeo3dglyLVEbehGSjA3CsZwA0P9XpYRVj89ePjL3aHtlfAVmSKik6iMXIADyyNBY2ErzkSJ5z58hgjvCUA8dbmcSy1FeTtqZVeWYzIGzFQ6F2bBUR66yk6NZ54oZx0v+YcOJa2XBRRYE0rQIwAEGqgp7zeNXs5jZ0qSdV13fU57FgEt1vQZygvcEzXqk1BIZJd2rca8NC3ASY5/1NiEkcUr+b4Kt3P9rDzbRVAtxMBEl7egRvDJxZUGsDedHQ313WNsjyVXprMYHA5QouEWIw/beDIhACFt1Qxqce1nkgO+WGnv+Z5LVxM0DfxrMmyOfkAaO9sowAAAAAAAgAAAAAAAAAAAAAAAExOH4LSltGLhZguD9aDJOjqmVDKAAAAAAAABkfKmUX/EAAAAAAAAAAAAAAAAPvMrCBIPafFO8lew+GsTSa1hgt6BX+YqTmYF/xVj/kYpcVlqaQA+BACOCjrtC+SnVPUaLEAkQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZFAAAAAAAAAAAAAAAASXGdJWpeoWv6V56hbpW+qfpBpFIAT5lOVFQIAAAAVwE/M9MAAAAAAAAAAAAAAACSLYVjYxsDwsTPgX9NGPaIOroBCYuuQZeMrwvRF80nwOa3YA7SgFOygiBHaRheo0cp0gpVAAEAAA==",
        vaaHash: "950ccda669259e22aa1725b2d09f2f7594031c10ab12c0b37514c292845e8130"
    }])('hash for VAA', async ({ vaaBase64, vaaHash }) => {
        const vaaBuf = parseVaa(Buffer.from(vaaBase64, "base64"));
        const vmCell = VAAtoCell(vaaBuf, splitBufferToCells);
        const vaa = await wormhole.getParseVM(vmCell);
        expect(vaa.hash.toString('hex')).toBe(vaaHash);
    });
});