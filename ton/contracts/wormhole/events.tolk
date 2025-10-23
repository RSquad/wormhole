
const EVENT_PUBLISH_MESSAGE = stringCrc32("event::message_published");

struct (0xA237A664) MessagePublishedEvent {
    sender: address
    sequence: uint64
    nonce: uint32
    payload: cell
    consistencyLevel: uint8
}

const EVENT_REQUEST_FOR_EXECUTION = stringCrc32("event::request_for_execution");

struct (0xB4E2F1C5) RequestForExecutionEvent {
    quoterAddress: address
    value: coins
    dstChain: uint16
    dstAddr: uint256
    refundAddr: uint256
    signedQuote: cell
    request: cell
    relayInstructions: cell
}