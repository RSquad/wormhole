
export const Opcodes = {
    OP_PUBLISH_MESSAGE: 0x1CE51423,
    OP_PARSE_AND_VERIFY_VM: 0x051679d3,
    OP_SEND_COMMENT: 0x222A627E,
    OP_RELAY_COMMENT: 0x327587B5,
    ANSWER_BIT: 0x80000000,
};

export const Events = {
    EVENT_PUBLISH_MESSAGE: 0x50acea3e,
    EVENT_VAA_VALIDATED_BY_CORE: 0x00000001,
    EVENT_VAA_PUBLISHED_BY_CORE: 0x00000002,
};

export const toAnswer = (opcode: number) => (opcode | Opcodes.ANSWER_BIT) >>> 0;