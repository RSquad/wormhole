tolk 1.1

import "../libraries/errors";
import "../libraries/tonmsg";
import "../wormhole/messages"

const OP_SEND_COMMENT = stringCrc32("op::integrator::send_comment");
const OP_RELAY_COMMENT = stringCrc32("op::integrator::Relay_comment");


struct Storage {
    wormholeAddress: address
    id: uint16
}

// load contract data from the persistent storage
fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData())
}

// save contract data into the persistent storage
fun Storage.save(self) {
    contract.setData(self.toCell())
}

// Call on source chain to send a comment
struct (0x222A627E) SendComment {
    queryId: uint64
    nonce: uint32
    consistencyLevel: uint8
    to: address
    comment: cell
}

// Call on destination chain to relay a comment to the recipient
struct (0x327587B5) RelayComment {
    queryId: uint64
    encodedVaa: cell
}

struct CommentVaa {
    to: address
    comment: cell
}

struct (0x00000001) VAAValidatedByCoreEvent {
    valid: bool
}

struct (0x00000002) VAAPublishedByCoreEvent {
    tailHash: uint256
}

type Operations = SendComment | PublishMessageAnswer | RelayComment | ParseAndVerifyVMAnswer

fun onInternalMessage(in: InMessage) {
    val msg = lazy Operations.fromSlice(in.body);
    match (msg) {
        SendComment => {
            var storage = lazy Storage.load();
            val payload = PublishMessage {
                queryId: msg.queryId,
                nonce: msg.nonce,
                consistencyLevel: msg.consistencyLevel,
                payload: CommentVaa {
                    to: msg.to,
                    comment: msg.comment
                }.toCell(),
                tail: beginCell().storeUint(0x11223344, 32).endCell()
            };
            
            call(storage.wormholeAddress, 0, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE, payload);
        }
        PublishMessageAnswer => {
            val tailHash = beginCell().storeUint(0x11223344, 32).endCell().hash();
            assert(msg.tail.hash() == tailHash) throw 1000;
        }
        RelayComment => {
            var storage = lazy Storage.load();
            val payload = ParseAndVerifyVM {
                queryId: msg.queryId,
                encodedVM: msg.encodedVaa
            };
            call(storage.wormholeAddress, 0, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE, payload);
        }
        ParseAndVerifyVMAnswer => {
            emit(VAAValidatedByCoreEvent{ valid: msg.valid });
        }
        else => {
            assert (in.body.isEmpty()) throw ERROR_UNKNOWN_OPCODE;
        }
    }
}