tolk 1.1

import "../libraries/errors";
import "../wormhole/events";
import "../wormhole/messages";
import "../libraries/tonmsg";

const CHAIN_ID_TON = 62;


type Operations = RequestExecution

fun onInternalMessage(in: InMessage) {
    val msg = lazy Operations.fromSlice(in.body);
    match (msg) {
        RequestExecution => {
            // Parse signedQuote cell: [quoter(256) | universalPayeeAddress(256) | src(16) | dst(16) | expiry(64)]
            var s = msg.signedQuote.beginParse();
            val quoterAddress = s.loadUint(256);
            val universalPayeeAddress = s.loadUint(256);
            val quoteSrcChain = s.loadUint(16) as uint16;
            val quoteDstChain = s.loadUint(16) as uint16;
            val expiryTime = s.loadUint(64) as uint64;

            assert(quoteSrcChain == CHAIN_ID_TON) throw ERROR_QUOTE_SRC_CHAIN_MISMATCH;
            assert(quoteDstChain == msg.dstChain) throw ERROR_QUOTE_DST_CHAIN_MISMATCH;
            assert(expiryTime > blockchain.now()) throw ERROR_QUOTE_EXPIRED;

            val payeeAddress = buildAddress(0, universalPayeeAddress);

            val quoterAddr = buildAddress(0, quoterAddress);
            val event = RequestForExecutionEvent {
                quoterAddress: quoterAddr,
                value: in.valueCoins,
                dstChain: msg.dstChain,
                dstAddr: msg.dstAddr,
                refundAddr: msg.refundAddr,
                signedQuote: msg.signedQuote,
                request: msg.request,
                relayInstructions: msg.relayInstructions
            };
            emit(event);

            // Forward received value to the payee address
            call(payeeAddress, in.valueCoins, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE, (0x00000000 as uint32));
        }
        else => {
            assert (in.body.isEmpty()) throw ERROR_UNKNOWN_OPCODE;
        }
    }
}

